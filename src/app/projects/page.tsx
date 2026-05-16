import { redirect } from "next/navigation";

/** Legacy projects hub — simplified app uses /timeline. */
export default function ProjectsRedirectPage() {
  redirect("/timeline");
}
