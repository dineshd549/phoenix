// Simple test to debug deployment issues
const { exec } = require("child_process");

const runCmd = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout);
    });
  });

async function testDeployment() {
  try {
    console.log("🔍 Testing deployment components...");
    
    // Test 1: Kubectl connection
    console.log("1. Testing kubectl connection...");
    const clusterInfo = await runCmd("kubectl cluster-info");
    console.log("✅ Kubectl working");
    
    // Test 2: Git repository access
    console.log("2. Testing git repository access...");
    const gitLs = await runCmd("git ls-remote https://github.com/dview-io/onboarding.git");
    console.log("✅ Git repository accessible");
    
    // Test 3: ArgoCD server access
    console.log("3. Testing ArgoCD server access...");
    try {
      const argocdTest = await runCmd("curl -k -s https://argocd.dview.io/api/v1/version");
      console.log("✅ ArgoCD server accessible");
    } catch (argocdError) {
      console.log("❌ ArgoCD server not accessible:", argocdError.message);
    }
    
    // Test 4: Base values file
    console.log("4. Testing base-values.yaml...");
    const fs = require('fs');
    if (fs.existsSync('base-values.yaml')) {
      console.log("✅ base-values.yaml exists");
    } else {
      console.log("❌ base-values.yaml missing");
    }
    
    console.log("🎯 Test completed!");
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testDeployment();
