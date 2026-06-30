---
name: swimtrack-deploy-workflow
description: Build / deploy / push commands for SwimTrack
metadata: 
  node_type: memory
  type: project
  originSessionId: ef1d7e26-ea8d-4006-a5e3-d5de216c00bf
---

From `c:\Users\liron.hs\Claude\Projects\Swimming`:

```
cd mobile && npm run build && cd ..      # prebuild copies ../swim_tracker.html -> mobile/public/extract.html -> dist/extract.html
firebase deploy --only hosting           # add ,firestore:rules when rules changed
git add -A && git commit -m "..." && git push origin master
```

- Firebase CLI is already logged in; `swimtrack-e12c8` is the default project (`.firebaserc`).
- Commit messages must end with the Co-Authored-By Claude line; commit with `-c commit.gpgsign=false` (gpg signing isn't set up here).
- After editing the desktop HTML, ALWAYS run the inline-script syntax check before deploy (Vite does NOT validate `extract.html`, it's just copied):
```
node -e 'const fs=require("fs");const h=fs.readFileSync("swim_tracker.html","utf8");const re=/<script\b([^>]*)>([\s\S]*?)<\/script>/g;let m,i=0,bad=0;while((m=re.exec(h))){i++;if(/src=/.test(m[1]))continue;let b=m[2].replace(/^\s*import[\s\S]*?;\s*$/gm,"").replace(/^\s*export\s+/gm,"");try{new Function(b)}catch(e){bad++;console.log("#"+i,e.message)}}console.log(bad?bad+" failed":"all "+i+" ok")'
```
- This sandbox has no outbound `curl`/gcloud and Firebase CLI MOTD fetch fails (harmless). To read/seed Firestore directly, use a node script importing from `mobile/node_modules` firebase Web SDK + a brief temp `firestore.rules` window.

See [[swimtrack-caching-and-debug-lessons]].
