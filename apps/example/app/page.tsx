import { readdirSync } from "fs";
import Link from "next/link";
import path from "path";

const demoPages = readdirSync(path.join(process.cwd(), "app", "examples"));
export default function Page(): JSX.Element {
  return (
    <div>
      <h1>Examples</h1>
      <ul>
        {demoPages.map((page) => (
          <li>
            <Link href={`/examples/${page}`}>{page}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
