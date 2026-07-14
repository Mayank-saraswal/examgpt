import { redirect } from "next/navigation";

/** Combined auth lives on /sign-in — keep route for old links. */
export default function SignUpRedirectPage() {
  redirect("/sign-in");
}
