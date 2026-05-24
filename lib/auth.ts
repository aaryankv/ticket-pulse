import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

type AuthProvider = NonNullable<NextAuthConfig["providers"]>[number];

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" }
    },
    async authorize(rawCredentials) {
      const parsed = credentialsSchema.safeParse(rawCredentials);
      if (!parsed.success) {
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
          role: true
        }
      });

      if (!user?.passwordHash) {
        return null;
      }

      const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!isValid) {
        return null;
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      };
    }
  })
];

const oracleSsoProvider = createOracleSsoProvider();
if (oracleSsoProvider) {
  providers.push(oracleSsoProvider);
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = "role" in user ? user.role : "USER";
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as "ADMIN" | "USER" | undefined) ?? "USER";
      }

      return session;
    }
  }
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

function createOracleSsoProvider(): AuthProvider | null {
  const issuer = process.env.ORACLE_SSO_ISSUER;
  const clientId = process.env.ORACLE_SSO_CLIENT_ID;
  const clientSecret = process.env.ORACLE_SSO_CLIENT_SECRET;

  if (!issuer || !clientId || !clientSecret) {
    return null;
  }

  return {
    id: "oracle-sso",
    name: "Oracle SSO",
    type: "oidc",
    issuer,
    clientId,
    clientSecret,
    authorization: {
      params: {
        scope: "openid email profile"
      }
    },
    profile(profile: Record<string, unknown>) {
      const email = stringClaim(profile.email);
      const name = stringClaim(profile.name) || stringClaim(profile.preferred_username) || email;

      return {
        id: stringClaim(profile.sub) || email,
        name,
        email,
        image: stringClaim(profile.picture) || null,
        role: "USER"
      };
    }
  } as AuthProvider;
}

function stringClaim(value: unknown) {
  return typeof value === "string" ? value : "";
}
