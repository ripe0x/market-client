import { Chrome } from "@/components/chrome";
import { IssueRightView } from "@/components/views/IssueRightView";
export default function Page() { return <Chrome mobileNav={{ title: "Issue a right", backHref: "/rights" }}><div className="page gutter"><IssueRightView /></div></Chrome>; }
