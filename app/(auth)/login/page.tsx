import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  const oracleSsoEnabled = Boolean(
    process.env.ORACLE_SSO_ISSUER && process.env.ORACLE_SSO_CLIENT_ID && process.env.ORACLE_SSO_CLIENT_SECRET
  );

  return (
    <div className="mx-auto flex w-full max-w-md justify-center">
      <Suspense>
        <LoginForm oracleSsoEnabled={oracleSsoEnabled} />
      </Suspense>
    </div>
  );
}
