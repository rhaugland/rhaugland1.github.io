import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

// admin emails — add slushie team admins here
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);

const isDev = process.env.NODE_ENV !== "production";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providers: any[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
];

// Dev-only credentials provider — bypasses Google OAuth for local testing
if (isDev) {
  providers.push(
    Credentials({
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "ryan@slushie.agency" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        if (!email) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    })
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    signIn({ profile, credentials }) {
      // dev credentials provider always allowed
      if (credentials) return true;
      // only allow @slushie.agency accounts for Google
      return profile?.email?.endsWith("@slushie.agency") ?? false;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = request.nextUrl.pathname.startsWith("/dashboard");
      if (isProtected && !isLoggedIn) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
        token.role = ADMIN_EMAILS.includes(user.email) ? "admin" : "team_member";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? "";
        session.user.role = (token.role as "admin" | "team_member") ?? "team_member";
      }
      return session;
    },
  },
});
