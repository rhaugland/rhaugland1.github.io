import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// admin emails — add slushie team admins here
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      // only allow @slushie.agency accounts
      return profile?.email?.endsWith("@slushie.agency") ?? false;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = request.nextUrl.pathname.startsWith("/dashboard");
      if (isProtected && !isLoggedIn) return false;
      return true;
    },
    session({ session, token }) {
      if (session.user && token.email) {
        session.user.role = ADMIN_EMAILS.includes(token.email)
          ? "admin"
          : "team_member";
      }
      return session;
    },
  },
});
