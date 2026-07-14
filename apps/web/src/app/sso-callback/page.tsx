import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

/**
 * OAuth redirect landing for Google SSO.
 * @see clerk-custom-ui core-3 signIn.sso redirectCallbackUrl
 */
export default function SSOCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}
