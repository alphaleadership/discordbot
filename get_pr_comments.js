import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";

dotenv.config();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function run() {
  try {
    const owner = "alphaleadership";
    const repo = "discordbot";
    
    console.log(`Recherche de PRs pour ${owner}/${repo}...`);
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      state: "open"
    });
    
    console.log(`Trouvé ${prs.length} PRs ouvertes.`);
    for (const pr of prs) {
      console.log(`PR #${pr.number}: ${pr.title} (Branche: ${pr.head.ref})`);
      if (pr.head.ref === "feature/server-info-config" || pr.head.ref.includes("server-info")) {
        console.log(`--- Détails pour PR #${pr.number} ---`);
        console.log(`Description:\n${pr.body}`);
        
        console.log("\n--- Commentaires sur la PR ---");
        const { data: comments } = await octokit.issues.listComments({
          owner,
          repo,
          issue_number: pr.number
        });
        for (const c of comments) {
          console.log(`[Commentaire de ${c.user.login} le ${c.created_at}]: ${c.body}`);
        }
        
        console.log("\n--- Commentaires de Review sur le code ---");
        const { data: reviewComments } = await octokit.pulls.listReviewComments({
          owner,
          repo,
          pull_number: pr.number
        });
        for (const rc of reviewComments) {
          console.log(`[Review de ${rc.user.login} sur ${rc.path} L${rc.line || rc.original_line}]: ${rc.body}`);
        }

        console.log("\n--- Reviews ---");
        const { data: reviews } = await octokit.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number
        });
        for (const r of reviews) {
          console.log(`[Review de ${r.user.login} - Statut: ${r.state}]: ${r.body}`);
        }
      }
    }
  } catch (err) {
    console.error("Erreur:", err);
  }
}

run();
