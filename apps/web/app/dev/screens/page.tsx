import { notFound } from "next/navigation";
import { DevScreens } from "./DevScreens";

// Development-only design QA. Not imported by any shipped route; hidden in production.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevScreens />;
}
