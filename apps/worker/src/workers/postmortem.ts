import { Worker, Job } from "bullmq";
import { prisma, Prisma } from "@slushie/db";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import { PHASE_TIMEOUTS } from "../queues";
import { createEvent } from "@slushie/events";
import type { SkillsUpdatedEvent } from "@slushie/events";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

interface PostmortemJobData {
  type: string;
  pipelineRunId: string;
  timestamp: number;
  data: {
    postmortemId: string;
    agentScores: Record<string, number>;
  };
}

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

export function createPostmortemWorker() {
  return new Worker<PostmortemJobData>(
    "postmortem",
    async (job: Job<PostmortemJobData>) => {
      const { pipelineRunId, data } = job.data;
      const log = createAgentLogger("postmortem", pipelineRunId);

      log.info({ postmortemId: data.postmortemId }, "postmortem agent starting");

      // 1. load all pipeline data — events, gap reports, transcript, analysis
      const run = await prisma.pipelineRun.findUnique({
        where: { id: pipelineRunId },
        include: {
          client: true,
          postmortem: true,
          call: {
            include: {
              analysis: {
                include: {
                  buildSpecs: {
                    include: {
                      prototypes: {
                        include: {
                          gapReports: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!run) {
        log.error("pipeline run not found");
        throw new Error(`pipeline run ${pipelineRunId} not found`);
      }

      if (!run.postmortem) {
        log.error("postmortem record not found");
        throw new Error(`postmortem for ${pipelineRunId} not found`);
      }

      // 2. load current agent skills (versioned — get latest per type)
      const currentSkills = await prisma.agentSkill.findMany({
        orderBy: [{ agentType: "asc" }, { version: "desc" }],
      });

      const latestSkills: Record<
        string,
        { id: string; version: number; promptTemplate: string; config: unknown }
      > = {};
      for (const skill of currentSkills) {
        if (
          !latestSkills[skill.agentType] ||
          skill.version > latestSkills[skill.agentType].version
        ) {
          latestSkills[skill.agentType] = {
            id: skill.id,
            version: skill.version,
            promptTemplate: skill.promptTemplate,
            config: skill.config,
          };
        }
      }

      // 3. load historical postmortem data for pattern detection
      const historicalPostmortems = await prisma.postmortem.findMany({
        where: {
          id: { not: data.postmortemId },
          employeeFeedback: { not: Prisma.DbNull },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      // load pipeline runs with clients for historical postmortems
      const historicalRunIds = historicalPostmortems.map((pm) => pm.pipelineRunId);
      const historicalRuns = await prisma.pipelineRun.findMany({
        where: { id: { in: historicalRunIds } },
        include: { client: true },
      });
      const runsByIdMap = new Map(historicalRuns.map((r) => [r.id, r]));

      // 4. prepare working directory with all artifacts
      const workDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `slushie-postmortem-${pipelineRunId}-`)
      );

      // write pipeline data
      fs.writeFileSync(
        path.join(workDir, "pipeline-data.json"),
        JSON.stringify(
          {
            pipelineRunId,
            client: run.client,
            transcript: run.call.transcript,
            coachingLog: run.call.coachingLog,
            analysis: run.call.analysis,
            buildSpecs: run.call.analysis?.buildSpecs ?? [],
            prototypes:
              run.call.analysis?.buildSpecs.flatMap((s) => s.prototypes) ?? [],
            gapReports:
              run.call.analysis?.buildSpecs.flatMap((s) =>
                s.prototypes.flatMap((p) => p.gapReports)
              ) ?? [],
          },
          null,
          2
        )
      );

      // write employee feedback
      fs.writeFileSync(
        path.join(workDir, "employee-feedback.json"),
        JSON.stringify(run.postmortem.employeeFeedback, null, 2)
      );

      // write current agent scores
      fs.writeFileSync(
        path.join(workDir, "agent-scores.json"),
        JSON.stringify(run.postmortem.agentScores, null, 2)
      );

      // write current skills
      fs.writeFileSync(
        path.join(workDir, "current-skills.json"),
        JSON.stringify(latestSkills, null, 2)
      );

      // write historical postmortem data for pattern identification
      fs.writeFileSync(
        path.join(workDir, "historical-postmortems.json"),
        JSON.stringify(
          historicalPostmortems.map((pm) => {
            const pmRun = runsByIdMap.get(pm.pipelineRunId);
            return {
              id: pm.id,
              clientName: pmRun?.client.name ?? "unknown",
              agentScores: pm.agentScores,
              employeeFeedback: pm.employeeFeedback,
              skillUpdates: pm.skillUpdates,
              createdAt: pm.createdAt,
            };
          }),
          null,
          2
        )
      );

      // 5. invoke claude code for postmortem analysis
      const prompt = `you are the slushie postmortem agent. your job is to analyze agent performance across a completed pipeline run and suggest concrete skill/prompt improvements.

read these files in the working directory:
- pipeline-data.json: full pipeline data including transcript, analysis, build specs, prototypes, and gap reports
- employee-feedback.json: human feedback on each agent (listener, analyst, builder, reviewer)
- agent-scores.json: auto-generated performance scores for each agent
- current-skills.json: current prompt templates and configs for each agent
- historical-postmortems.json: past postmortem data for identifying cross-build patterns

your analysis should:
1. identify patterns in agent performance — what worked, what didn't
2. compare with historical data to find recurring issues (e.g., "builder consistently struggles with scheduling uis")
3. suggest specific, actionable prompt modifications for each agent
4. prioritize improvements by impact

write your output to a file called "postmortem-result.json" with this exact structure:
{
  "agentAnalysis": {
    "listener": { "strengths": [...], "weaknesses": [...], "promptChanges": [...] },
    "analyst": { "strengths": [...], "weaknesses": [...], "promptChanges": [...] },
    "builder": { "strengths": [...], "weaknesses": [...], "promptChanges": [...] },
    "reviewer": { "strengths": [...], "weaknesses": [...], "promptChanges": [...] }
  },
  "patterns": [...],
  "skillUpdates": [
    {
      "agentType": "builder",
      "change": "description of what to change in the prompt",
      "newPromptSection": "the actual text to add/modify"
    }
  ]
}

be specific. do not give vague suggestions like "improve accuracy." instead say exactly what prompt text to add or modify and why.`;

      const result = await invokeClaudeCode({
        prompt,
        workingDirectory: workDir,
        timeoutMs: PHASE_TIMEOUTS.reviewer, // 10 min
        pipelineRunId,
      });

      log.info(
        { outputLength: result.output.length },
        "claude code postmortem analysis complete"
      );

      // 6. read and parse the result
      const resultPath = path.join(workDir, "postmortem-result.json");
      if (!fs.existsSync(resultPath)) {
        log.error("postmortem agent did not produce postmortem-result.json");
        throw new Error("postmortem agent failed to produce output");
      }

      const postmortemResult = JSON.parse(
        fs.readFileSync(resultPath, "utf-8")
      );

      // 7. create new skill versions — never overwrite existing versions
      const skillUpdates: Array<{
        agentType: string;
        version: number;
        change: string;
      }> = [];

      if (Array.isArray(postmortemResult.skillUpdates)) {
        for (const update of postmortemResult.skillUpdates) {
          const current = latestSkills[update.agentType];
          const newVersion = current ? current.version + 1 : 1;
          const basePrompt = current?.promptTemplate ?? "";

          // append new prompt section — never overwrite, always version
          const updatedPrompt = basePrompt
            ? `${basePrompt}\n\n# skill update from postmortem ${data.postmortemId}\n${update.newPromptSection}`
            : `# initial skill from postmortem ${data.postmortemId}\n${update.newPromptSection}`;

          await prisma.agentSkill.create({
            data: {
              agentType: update.agentType,
              version: newVersion,
              promptTemplate: updatedPrompt,
              config: current?.config ?? {},
              updatedByPostmortemId: data.postmortemId,
            },
          });

          skillUpdates.push({
            agentType: update.agentType,
            version: newVersion,
            change: update.change,
          });

          log.info(
            { agentType: update.agentType, version: newVersion },
            "agent skill version created"
          );
        }
      }

      // 8. update postmortem record with skill updates
      await prisma.postmortem.update({
        where: { id: data.postmortemId },
        data: {
          skillUpdates: skillUpdates,
        },
      });

      // 9. write skill files to packages/agents/ and commit to git
      const agentsDir = path.resolve(process.cwd(), "packages/agents");
      if (fs.existsSync(agentsDir)) {
        // write postmortem result for version control
        const postmortemDir = path.join(agentsDir, "postmortems");
        if (!fs.existsSync(postmortemDir)) {
          fs.mkdirSync(postmortemDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(postmortemDir, `${pipelineRunId}.json`),
          JSON.stringify(postmortemResult, null, 2)
        );

        // write updated skill prompt files
        const skillsDir = path.join(agentsDir, "skills");
        if (!fs.existsSync(skillsDir)) {
          fs.mkdirSync(skillsDir, { recursive: true });
        }
        for (const update of skillUpdates) {
          const skill = await prisma.agentSkill.findFirst({
            where: {
              agentType: update.agentType,
              version: update.version,
            },
          });
          if (skill) {
            fs.writeFileSync(
              path.join(
                skillsDir,
                `${skill.agentType}-v${skill.version}.md`
              ),
              skill.promptTemplate
            );
          }
        }

        // commit versioned skill updates to git
        const { execSync } = await import("node:child_process");
        try {
          execSync(
            "git add packages/agents/postmortems/ packages/agents/skills/",
            {
              cwd: path.resolve(process.cwd()),
              stdio: "pipe",
            }
          );
          execSync(
            `git commit -m "chore: skill updates from postmortem ${pipelineRunId.slice(0, 8)}"`,
            {
              cwd: path.resolve(process.cwd()),
              stdio: "pipe",
            }
          );
          log.info("skill updates committed to git");
        } catch (gitError) {
          log.warn(
            { error: gitError },
            "git commit failed — changes may already be committed or repo is dirty"
          );
        }
      }

      // 10. publish skills.updated event
      const skillsEvent = createEvent<SkillsUpdatedEvent>(
        "skills.updated",
        pipelineRunId,
        {
          updatedAgents: skillUpdates.map((u) => u.agentType),
          postmortemId: data.postmortemId,
        }
      );
      await publishEvent(skillsEvent);

      // 11. cleanup temp directory
      fs.rmSync(workDir, { recursive: true, force: true });

      log.info(
        { skillUpdatesCount: skillUpdates.length },
        "postmortem agent completed"
      );
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  );
}
