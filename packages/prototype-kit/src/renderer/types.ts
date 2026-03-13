export interface ManifestComponent {
  type: "stat-card" | "data-table" | "form" | "chart" | "nav-bar" | "walkthrough-overlay";
  id: string;
  props: {
    title?: string;
    description?: string;
    [key: string]: unknown;
  };
  data: Record<string, unknown>;
}

export interface ManifestPage {
  route: string;
  title: string;
  layout: "dashboard" | "form" | "list-detail" | "calendar" | "table";
  components: ManifestComponent[];
}

export interface ManifestWalkthroughStep {
  targetComponentId: string;
  targetPage: string;
  step: number;
  title: string;
  text: string;
}

export interface ManifestMockEndpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  responseData: Record<string, unknown>;
  delayMs: number;
}

export interface ManifestSimulatedIntegration {
  name: string;
  type: string;
  mockAccountConfig: {
    connected: boolean;
    accountName: string;
    lastSync: string;
  };
}

export interface ManifestDecisionLogEntry {
  decision: string;
  reasoning: string;
  flaggedForReview: boolean;
  consultationRound: number | null;
}

export interface PrototypeManifest {
  version: number;
  pages: ManifestPage[];
  walkthrough: ManifestWalkthroughStep[];
  mockEndpoints: ManifestMockEndpoint[];
  simulatedIntegrations: ManifestSimulatedIntegration[];
  decisionLog: ManifestDecisionLogEntry[];
}
