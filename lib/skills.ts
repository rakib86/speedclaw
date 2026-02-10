import fs from "fs";
import path from "path";

const SKILLS_DIR = path.join(process.cwd(), "skills");

export interface Skill {
  name: string;
  content: string;
}

/**
 * Load all .md skill files from the skills/ directory.
 * Each file becomes a skill the AI can reference.
 */
export function loadAllSkills(): Skill[] {
  const skills: Skill[] = [];

  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
      return skills;
    }

    const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
        skills.push({
          name: file.replace(/\.md$/, ""),
          content,
        });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Skills dir doesn't exist yet
  }

  return skills;
}

/**
 * Format all skills into a string for the system prompt.
 */
export function getSkillsPrompt(): string {
  const skills = loadAllSkills();
  if (skills.length === 0) return "";

  const sections = skills.map((s) => `### Skill: ${s.name}\n${s.content}`);

  return `\n## Learned Skills\nYou have the following skills/knowledge that teach you HOW to accomplish specific tasks. When a user request matches a skill, follow its instructions using your available tools (especially http_request for API calls).\n\n${sections.join("\n\n---\n\n")}`;
}
