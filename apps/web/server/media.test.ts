import { expect, test } from "vitest";
import { safeUrl } from "./media";

test("safeUrl refuses private, link-local, CGNAT, mapped and non-http targets", async () => {
  for (const u of [
    "http://127.0.0.1/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:169.254.169.254]/",
    "http://[::1]/",
    "http://10.0.0.1/",
    "http://172.20.0.1/",
    "http://100.64.1.1/",
    "http://localhost/",
    "http://user:pw@1.1.1.1/",
    "ftp://1.1.1.1/",
    "file:///etc/passwd",
  ]) {
    expect(await safeUrl(u), u).toBeNull();
  }
  expect((await safeUrl("https://1.1.1.1/a.png"))?.href).toBe("https://1.1.1.1/a.png");
});
