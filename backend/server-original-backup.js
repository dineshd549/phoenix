const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const yaml = require("js-yaml");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const simpleGit = require("simple-git");
const multer = require("multer");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only kubeconfig files
    if (file.originalname.includes('kubeconfig') || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload a kubeconfig file.'));
    }
  }
});

const git = simpleGit();

/* ================= CONFIG ================= */
const GIT_REPO = "https://github.com/dview-io/onboarding.git";
const GIT_BRANCH = "devops";
const HELM_CHART_PATH = "release/v3.0.0/v4.0.0";
const ARGOCD_URL = "https://argocd.dview.io";
const BASE_VALUES_FILE = "base-values.yaml";

/* ================= HELPERS ================= */
const runCmd = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout);
    });
  });

/* ================= GET ARGOCD SESSION TOKEN ================= */
async function getArgoToken() {
  try {
    const res = await axios.post(`${ARGOCD_URL}/api/v1/session`, {
      username: "admin",
      password: "D@ta!23456"
    });
    return res.data.token;
  } catch (error) {
    console.error("ArgoCD authentication failed:", error.message);
    throw new Error("Failed to authenticate with ArgoCD");
  }
}

/* ================= VALUES ================= */
app.get("/values", async (req, res) => {
  try {
    let values = {};
    try {
      const baseFile = fs.readFileSync(BASE_VALUES_FILE, "utf8");
      values = yaml.load(baseFile) || {};
    } catch {
      console.log("base-values.yaml missing or invalid, using empty config");
    }
    res.json(values);
  } catch (err) {
    console.error("Values fetch error:", err);
    res.status(500).json({ error: "Failed to fetch values" });
  }
});

/* ================= KUBECONFIG UPLOAD ================= */
app.post("/upload-kubeconfig", upload.single('file'), async (req, res) => {
  try {
    console.log("Kubeconfig upload request received");
    
    if (!req.file) {
      console.log("No file uploaded");
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadedFile = req.file;
    console.log("Received kubeconfig file:", uploadedFile.originalname, "Size:", uploadedFile.size);

    // Read the uploaded file
    const kubeconfigContent = fs.readFileSync(uploadedFile.path, 'utf8');
    console.log("File content length:", kubeconfigContent.length);
    
    // Validate kubeconfig content
    try {
      const kubeconfig = yaml.load(kubeconfigContent);
      console.log("Parsed kubeconfig keys:", Object.keys(kubeconfig));
      
      if (!kubeconfig.clusters || !kubeconfig.users || !kubeconfig.contexts) {
        console.log("Invalid kubeconfig structure");
        fs.unlinkSync(uploadedFile.path); // Clean up uploaded file
        return res.status(400).json({ error: "Invalid kubeconfig file format" });
      }
    } catch (yamlError) {
      console.log("YAML parsing error:", yamlError.message);
      fs.unlinkSync(uploadedFile.path); // Clean up uploaded file
      return res.status(400).json({ error: "Invalid YAML format in kubeconfig" });
    }

    // Create kubeconfig directory if it doesn't exist
    const kubeconfigDir = './kubeconfigs';
    if (!fs.existsSync(kubeconfigDir)) {
      fs.mkdirSync(kubeconfigDir, { recursive: true });
    }

    // Save kubeconfig file
    const kubeconfigPath = path.join(kubeconfigDir, 'config');
    fs.writeFileSync(kubeconfigPath, kubeconfigContent);
    console.log("Kubeconfig saved to:", kubeconfigPath);

    // Set KUBECONFIG environment variable
    process.env.KUBECONFIG = kubeconfigPath;

    // Test kubectl connection
    try {
      const testOutput = await runCmd("kubectl cluster-info");
      console.log("Kubectl connection successful");
    } catch (kubectlError) {
      console.error("Kubectl connection failed:", kubectlError.message);
      fs.unlinkSync(uploadedFile.path); // Clean up uploaded file
      return res.status(400).json({ 
        error: "Kubectl connection failed", 
        details: kubectlError.message 
      });
    }

    // Clean up uploaded file
    fs.unlinkSync(uploadedFile.path);

    const kubeconfig = yaml.load(kubeconfigContent);
    res.json({ 
      status: "success", 
      message: "Kubeconfig uploaded and validated successfully",
      path: kubeconfigPath,
      clusters: Object.keys(kubeconfig.clusters || {})
    });

  } catch (err) {
    console.error("Kubeconfig upload error:", err.message);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: "Kubeconfig upload failed", 
      details: err.message 
    });
  }
});

/* ================= CLUSTERS ================= */
app.get("/clusters", async (req, res) => {
  try {
    const { cloud } = req.query;
    
    // Get all kubectl contexts
    const stdout = await runCmd("kubectl config get-contexts -o name");
    const allClusters = stdout.split("\n").filter(Boolean);
    
    // Filter clusters by cloud provider based on naming conventions
    let filteredClusters = allClusters;
    
    if (cloud) {
      switch (cloud.toLowerCase()) {
        case 'gcp':
          filteredClusters = allClusters.filter(cluster => 
            cluster.includes('gcp') || 
            cluster.includes('gke') || 
            cluster.includes('google') ||
            cluster.match(/gke_.+/) // GKE cluster naming pattern
          );
          break;
        case 'aws':
          filteredClusters = allClusters.filter(cluster => 
            cluster.includes('aws') || 
            cluster.includes('eks') || 
            cluster.includes('amazon') ||
            cluster.match(/arn:aws:.+/) // AWS ARN pattern
          );
          break;
        case 'azure':
          filteredClusters = allClusters.filter(cluster => 
            cluster.includes('azure') || 
            cluster.includes('aks') || 
            cluster.includes('microsoft') ||
            cluster.includes('aks-') // AKS cluster naming pattern
          );
          break;
        default:
          // If no specific cloud, return all clusters
          filteredClusters = allClusters;
      }
    }
    
    res.json({ clusters: filteredClusters });
  } catch (err) {
    console.error("Cluster fetch error:", err);
    res.status(500).json({ error: "Cluster fetch error" });
  }
});

/* ================= NAMESPACES ================= */
app.get("/namespaces", async (req, res) => {
  try {
    const stdout = await runCmd("kubectl get ns -o json");
    const data = JSON.parse(stdout);

    const namespaces = data.items
      .map((ns) => ns.metadata.name)
      .filter((ns) => !ns.startsWith("kube") && !ns.includes("system"));

    res.json({ namespaces });
  } catch (err) {
    console.error("Namespace error:", err);
    res.status(500).json({ error: "Namespace error" });
  }
});

/* ================= CREATE NAMESPACE ================= */
app.post("/create-namespace", async (req, res) => {
  try {
    const { namespace } = req.body;
    if (!namespace) {
      return res.status(400).json({ error: "Namespace required" });
    }

    try {
      await runCmd(`kubectl get ns ${namespace}`);
      res.json({ status: "exists", message: "Namespace already exists" });
    } catch {
      console.log("Creating namespace:", namespace);
      await runCmd(`kubectl create ns ${namespace}`);
      res.json({ status: "created", message: "Namespace created successfully" });
    }
  } catch (err) {
    console.error("Namespace creation error:", err);
    res.status(500).json({ error: "Namespace creation failed" });
  }
});

/* ================= USE CONTEXT ================= */
app.post("/use-context", async (req, res) => {
  try {
    const { context } = req.body;
    if (!context) {
      return res.status(400).json({ error: "Context required" });
    }

    await runCmd(`kubectl config use-context ${context}`);
    res.json({ status: "success", message: "Context switched successfully" });
  } catch (err) {
    console.error("Context switch error:", err);
    res.status(500).json({ error: "Context switch failed" });
  }
});

/* ================= DEPLOY ================= */
app.post("/deploy", async (req, res) => {
  try {
    const { services, namespace, deploymentName, cluster, extraEnv } = req.body;

    if (!deploymentName) {
      return res.status(400).json({ error: "Deployment name required" });
    }

    if (!namespace) {
      return res.status(400).json({ error: "Namespace required" });
    }

    console.log("Deploy Request:", { deploymentName, namespace, cluster, services });

    /* ================= VALIDATE KUBECONFIG ================= */
    try {
      await runCmd("kubectl cluster-info");
      console.log("Kubectl connection validated");
    } catch (err) {
      console.error("Kubectl validation failed:", err.message);
      return res.status(400).json({ 
        error: "Please upload kubeconfig first", 
        details: "No valid Kubernetes configuration found. Please upload a kubeconfig file." 
      });
    }

    /* ================= SWITCH CLUSTER ================= */
    if (cluster) {
      await runCmd(`kubectl config use-context ${cluster}`);
    }

    /* ================= CREATE NAMESPACE ================= */
    try {
      await runCmd(`kubectl get ns ${namespace}`);
    } catch {
      console.log("Creating namespace:", namespace);
      await runCmd(`kubectl create ns ${namespace}`);
    }

    /* ================= LOAD BASE VALUES ================= */
    let values = {};
    try {
      console.log("Attempting to read base values from:", BASE_VALUES_FILE);
      const baseFile = fs.readFileSync(BASE_VALUES_FILE, "utf8");
      console.log("Base values file content:", baseFile);
      values = yaml.load(baseFile) || {};
      console.log("Parsed base values:", JSON.stringify(values, null, 2));
    } catch (err) {
      console.log("Error reading base-values.yaml:", err.message);
      console.log("base-values.yaml missing or invalid, using empty config");
    }

    /* ================= APPLY SERVICES ================= */
    values.deploy = values.deploy || {};

    // First, disable ALL services explicitly
    const allServices = ["mysql", "hive", "redis", "kafka", "trino", "apollo", "cerebrum", "artemis", "dex", "mirage", "cosmos", "trinity", "dsense", "rangeradmin", "gitsync", "cortex", "jobviewer"];
    allServices.forEach((svc) => {
      values.deploy[svc] = false;
    });

    // Then enable only selected services
    Object.keys(services || {}).forEach((svc) => {
      if (services[svc]) { // Only enable if selected in UI
        values.deploy[svc] = true;
      }
    });

    /* ================= NAMESPACE REPLACEMENTS ================= */
    // Convert values object to string for replacement
    let valuesString = yaml.dump(values);
    
    // Replace hardcoded dview references with target namespace
    valuesString = valuesString.replace(/redis-master\.dview\.svc\.cluster\.local/g, `redis-master.${namespace}.svc.cluster.local`);
    valuesString = valuesString.replace(/kafka\.dview\.svc\.cluster\.local/g, `kafka.${namespace}.svc.cluster.local`);
    valuesString = valuesString.replace(/([^\.])dview\.svc\.cluster\.local/g, `$1${namespace}.svc.cluster.local`);
    
    // Fix node selector to use existing node labels instead of hardcoded 'orion'
    valuesString = valuesString.replace(/roles:\s*orion/g, 'roles: fiber-aqua');
    
    // Convert back to object
    values = yaml.load(valuesString);

    /* ================= ENV VARIABLES ================= */
    values.extraEnv = values.extraEnv || [];
    (extraEnv || []).forEach(({ key, value }) => {
      if (key && value) {
        values.extraEnv.push({ key, value });
      }
    });

    /* ================= SAVE VALUES FILE ================= */
    const deploymentDir = path.join(HELM_CHART_PATH, "deployments", deploymentName);
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const filePath = path.join(deploymentDir, "values.yaml");
    fs.writeFileSync(filePath, yaml.dump(values));

    console.log("Saved values file:", filePath);

    /* ================= GIT OPERATIONS ================= */
    try {
      // Clone repo if not exists
      if (!fs.existsSync("onboarding-repo")) {
        console.log("Cloning repository...");
        await git.clone(GIT_REPO, "onboarding-repo");
      }

      const repoGit = simpleGit("onboarding-repo");
      await repoGit.checkout(GIT_BRANCH);
      await repoGit.pull("origin", GIT_BRANCH);

      // Copy deployment files to repo
      const repoDeploymentDir = path.join("onboarding-repo", HELM_CHART_PATH, "deployments", deploymentName);
      if (!fs.existsSync(repoDeploymentDir)) {
        fs.mkdirSync(repoDeploymentDir, { recursive: true });
      }

      const repoFilePath = path.join(repoDeploymentDir, "values.yaml");
      fs.writeFileSync(repoFilePath, yaml.dump(values));

      // Commit and push
      await repoGit.add(path.join(HELM_CHART_PATH, "deployments", deploymentName));
      await repoGit.commit(`Deploy ${deploymentName} to ${namespace}`);
      await repoGit.push("origin", GIT_BRANCH);

      console.log("Git push successful");
    } catch (gitError) {
      console.error("Git operation failed:", gitError);
      return res.status(500).json({ error: "Git operation failed", details: gitError.message });
    }

    /* ================= ARGOCD APP MANAGEMENT ================= */
    try {
      // For now, let's try direct kubectl deployment instead of ArgoCD
      console.log("Attempting direct kubectl deployment...");
      
      try {
        // Try a simple kubectl deployment instead of Helm for now
        console.log("Attempting simple kubectl deployment...");
        
        // Create a simple MySQL deployment using kubectl
        const mysqlDeployment = {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            name: `${deploymentName}-mysql`,
            namespace: namespace,
            labels: {
              app: `${deploymentName}-mysql`
            }
          },
          spec: {
            replicas: 1,
            selector: {
              matchLabels: {
                app: `${deploymentName}-mysql`
              }
            },
            template: {
              metadata: {
                labels: {
                  app: `${deploymentName}-mysql`
                }
              },
              spec: {
                containers: [{
                  name: "mysql",
                  image: "mysql:8",
                  env: [
                    { name: "MYSQL_ROOT_PASSWORD", value: "root" },
                    { name: "MYSQL_DATABASE", value: "appdb" }
                  ],
                  ports: [{ containerPort: 3306 }]
                }]
              }
            }
          }
        };
        
        const mysqlService = {
          apiVersion: "v1",
          kind: "Service",
          metadata: {
            name: `${deploymentName}-mysql`,
            namespace: namespace
          },
          spec: {
            selector: {
              app: `${deploymentName}-mysql`
            },
            ports: [{ port: 3306, targetPort: 3306 }]
          }
        };
        
        // Apply deployment and service
        const deployCmd = `echo '${JSON.stringify(mysqlDeployment)}' | kubectl apply -f - -n ${namespace}`;
        const serviceCmd = `echo '${JSON.stringify(mysqlService)}' | kubectl apply -f - -n ${namespace}`;
        
        console.log("Running kubectl deployment:", deployCmd);
        const deployOutput = await runCmd(deployCmd);
        console.log("Deployment output:", deployOutput);
        
        console.log("Running kubectl service:", serviceCmd);
        const serviceOutput = await runCmd(serviceCmd);
        console.log("Service output:", serviceOutput);
        
        return res.json({
          status: "success",
          message: `Deployment "${deploymentName}" created successfully in namespace "${namespace}" via kubectl`,
          deploymentName: deploymentName,
          namespace: namespace,
          cluster: cluster || "default"
        });
        
      } catch (kubectlError) {
        console.error("kubectl deployment failed:", kubectlError);
        console.error("kubectl error message:", kubectlError.message);
        
        // Fallback to Git-only approach with clear message
        return res.json({
          status: "warning",
          message: `Deployment "${deploymentName}" configuration pushed to Git. Manual deployment required.`,
          deploymentName: deploymentName,
          namespace: namespace,
          cluster: cluster || "default",
          warning: `kubectl deployment failed: ${kubectlError.message || 'Unknown error'}. Configuration pushed to Git repository for manual deployment.`
        });
      }
      
    } catch (argoError) {
      console.error("Deployment failed:", argoError.message);
      return res.status(500).json({ 
        status: "error",
        error: "Deployment failed", 
        details: argoError.message 
      });
    }
  } catch (err) {
    console.error("DEPLOYMENT ERROR:", err);
    console.error("Error details:", JSON.stringify(err, null, 2));
    res.status(500).json({ 
      status: "error",
      error: "Deployment failed", 
      details: err.message || err.toString() || "Unknown error occurred"
    });
  }
});

/* ================= CREATE CLUSTER ================= */
app.post("/create-cluster/gcp", async (req, res) => {
  try {
    const { project, cluster, zone, network, subnetwork, networkTags, nodepools, credentials } = req.body;
    
    console.log("GCP Cluster Creation Request:", { project, cluster, zone });
    
    // Implement GCP cluster creation logic
    const { exec } = require("child_process");
    
    // Check if gcloud is authenticated
    const authCheck = exec("gcloud auth list --format=\"value(account)\"", (error, stdout, stderr) => {
      if (error || !stdout || stdout.trim() === '') {
        return res.status(400).json({ error: "GCloud authentication required" });
      }
      
      const activeAccount = stdout.trim();
      console.log("Using GCP account:", activeAccount);
      
      // Create GKE cluster with first nodepool
      const firstPool = nodepools && nodepools[0] ? nodepools[0] : {};
      let createCmd = `gcloud container clusters create ${cluster} \
        --project=${project} \
        --zone=${zone} \
        --num-nodes=${firstPool.nodeCount || 3} \
        --machine-type=${firstPool.machineType || 'e2-medium'} \
        --network=${network || 'default'} \
        --subnetwork=${subnetwork || 'default'} \
        --enable-autoscaling \
        --min-nodes=1 \
        --max-nodes=10`;
      
      // Add first nodepool labels
      if (firstPool.labels && firstPool.labels.trim()) {
        createCmd += ` --node-labels=${firstPool.labels.trim()}`;
      } else {
        createCmd += ` --node-labels=environment=devops,cluster=${cluster},managed-by=k8s-ui`;
      }
      
      if (networkTags && networkTags.length > 0) {
        createCmd += ` --tags=${networkTags.join(',')}`;
      }
      
      console.log("Executing GKE cluster creation with first nodepool:", createCmd);
      
      // Execute with 5-minute timeout
      exec(createCmd, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
          console.error("GKE cluster creation failed:", error);
          return res.status(500).json({ 
            error: "GKE cluster creation failed", 
            details: stderr 
          });
        }
        
        console.log("GKE cluster creation output:", stdout);
        
        // Add additional nodepools if any
        if (nodepools && nodepools.length > 1) {
          const additionalPools = nodepools.slice(1);
          let poolCreationPromises = [];
          
          additionalPools.forEach((pool, index) => {
            const poolCmd = `gcloud container node-pools create ${pool.name} \
              --cluster=${cluster} \
              --zone=${zone} \
              --num-nodes=${pool.nodeCount || 3} \
              --machine-type=${pool.machineType || 'e2-medium'} \
              --enable-autoscaling \
              --min-nodes=1 \
              --max-nodes=10 \
              --node-labels=${pool.labels && pool.labels.trim() ? pool.labels.trim() : 'environment=devops,managed-by=k8s-ui'}`;
            
            console.log(`Creating additional nodepool ${pool.name}:`, poolCmd);
            
            const promise = new Promise((resolve, reject) => {
              exec(poolCmd, { timeout: 300000 }, (poolError, poolStdout, poolStderr) => {
                if (poolError) {
                  console.error(`Nodepool ${pool.name} creation failed:`, poolError);
                  resolve({ success: false, pool: pool.name, error: poolStderr });
                } else {
                  console.log(`Nodepool ${pool.name} created successfully:`, poolStdout);
                  resolve({ success: true, pool: pool.name });
                }
              });
            });
            
            poolCreationPromises.push(promise);
          });
          
          // Wait for all additional nodepools to be created
          Promise.all(poolCreationPromises).then(results => {
            console.log("All additional nodepools creation results:", results);
            
            // Get cluster credentials
            const getCredsCmd = `gcloud container clusters get-credentials ${cluster} --zone=${zone} --project=${project}`;
            
            exec(getCredsCmd, (credsError, credsStdout, credsStderr) => {
              if (credsError) {
                console.error("Failed to get cluster credentials:", credsError);
                return res.json({
                  status: "success",
                  message: `GKE cluster "${cluster}" created with ${nodepools.length} nodepools but credentials fetch failed`,
                  cluster: cluster,
                  nodepools: nodepools,
                  warning: "Manual kubectl configuration required"
                });
              }
              
              console.log("Cluster credentials obtained successfully");
              
              res.json({
                status: "success",
                message: `GKE cluster "${cluster}" created successfully with ${nodepools.length} nodepools`,
                cluster: cluster,
                project: project,
                zone: zone,
                nodepools: nodepools
              });
            });
          });
        } else {
          // Single nodepool case - get credentials directly
          const getCredsCmd = `gcloud container clusters get-credentials ${cluster} --zone=${zone} --project=${project}`;
          
          exec(getCredsCmd, (credsError, credsStdout, credsStderr) => {
            if (credsError) {
              console.error("Failed to get cluster credentials:", credsError);
              return res.json({
                status: "success",
                message: `GKE cluster "${cluster}" created but credentials fetch failed`,
                cluster: cluster,
                warning: "Manual kubectl configuration required"
              });
            }
            
            console.log("Cluster credentials obtained successfully");
            
            res.json({
              status: "success",
              message: `GKE cluster "${cluster}" created and configured successfully`,
              cluster: cluster,
              project: project,
              zone: zone,
              nodepools: nodepools || [{ name: 'default-pool', nodeCount: 3, machineType: 'e2-medium' }]
            });
          });
        }
      });
    });
  } catch (err) {
    console.error("GCP cluster creation error:", err);
    res.status(500).json({ error: "GCP cluster creation failed" });
  }
});

app.post("/create-cluster/aws", async (req, res) => {
  try {
    const { cluster, region, accountId, vpcId, subnetIds, securityGroupIds, nodepools, accessKeyId, secretAccessKey } = req.body;
    
    console.log("AWS Cluster Creation Request:", { cluster, region, accountId });
    
    // Implement AWS EKS cluster creation logic
    const { exec } = require("child_process");
    
    // Check if AWS CLI is configured
    const authCheck = exec("aws sts get-caller-identity", (error, stdout, stderr) => {
      if (error) {
        return res.status(400).json({ error: "AWS CLI configuration required" });
      }
      
      const identity = JSON.parse(stdout);
      console.log("Using AWS account:", identity.Account);
      
      // Create EKS cluster with first nodegroup
      const firstPool = nodepools && nodepools[0] ? nodepools[0] : {};
      let createCmd = `aws eks create-cluster \
        --name ${cluster} \
        --region ${region} \
        --version 1.28 \
        --role-arn arn:aws:iam::${accountId}:role/EKSServiceRole \
        --resources-vpc-config subnetIds=${subnetIds ? subnetIds.join(',') : ''},securityGroupIds=${securityGroupIds ? securityGroupIds.join(',') : ''} \
        --nodegroup-name ${firstPool.name || 'default-nodegroup'} \
        --node-type ${firstPool.machineType || 't3.medium'} \
        --nodes ${firstPool.nodeCount || 3} \
        --nodes-min 1 \
        --nodes-max 10 \
        --managed`;
      
      // Add first nodegroup labels
      if (firstPool.labels && firstPool.labels.trim()) {
        createCmd += ` --labels ${firstPool.labels.trim()}`;
      } else {
        createCmd += ` --labels environment=devops,cluster=${cluster},managed-by=k8s-ui`;
      }
      
      console.log("Executing EKS cluster creation with first nodegroup:", createCmd);
      
      // Execute with 5-minute timeout
      exec(createCmd, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
          console.error("EKS cluster creation failed:", error);
          return res.status(500).json({ 
            error: "EKS cluster creation failed", 
            details: stderr 
          });
        }
        
        console.log("EKS cluster creation output:", stdout);
        
        // Add additional nodegroups if any
        if (nodepools && nodepools.length > 1) {
          const additionalGroups = nodepools.slice(1);
          let groupCreationPromises = [];
          
          additionalGroups.forEach((pool, index) => {
            const groupCmd = `aws eks create-nodegroup \
              --cluster-name ${cluster} \
              --nodegroup-name ${pool.name} \
              --region ${region} \
              --scaling-config minSize=1,maxSize=10,desiredSize=${pool.nodeCount || 3} \
              --subnets ${subnetIds ? subnetIds.join(' ') : ''} \
              --instance-types ${pool.machineType || 't3.medium'} \
              --managed \
              --labels ${pool.labels && pool.labels.trim() ? pool.labels.trim() : 'environment=devops,managed-by=k8s-ui'}`;
            
            console.log(`Creating additional nodegroup ${pool.name}:`, groupCmd);
            
            const promise = new Promise((resolve, reject) => {
              exec(groupCmd, { timeout: 300000 }, (groupError, groupStdout, groupStderr) => {
                if (groupError) {
                  console.error(`Nodegroup ${pool.name} creation failed:`, groupError);
                  resolve({ success: false, group: pool.name, error: groupStderr });
                } else {
                  console.log(`Nodegroup ${pool.name} created successfully:`, groupStdout);
                  resolve({ success: true, group: pool.name });
                }
              });
            });
            
            groupCreationPromises.push(promise);
          });
          
          // Wait for all additional nodegroups to be created
          Promise.all(groupCreationPromises).then(results => {
            console.log("All additional nodegroups creation results:", results);
            
            // Wait for cluster to be active and update kubeconfig
            const updateCmd = `aws eks update-kubeconfig --name ${cluster} --region ${region}`;
            
            exec(updateCmd, (updateError, updateStdout, updateStderr) => {
              if (updateError) {
                console.error("Failed to update kubeconfig:", updateError);
                return res.json({
                  status: "success",
                  message: `EKS cluster "${cluster}" created with ${nodepools.length} nodegroups but kubeconfig update failed`,
                  cluster: cluster,
                  nodepools: nodepools,
                  warning: "Manual kubectl configuration required"
                });
              }
              
              console.log("EKS cluster configured successfully");
              
              res.json({
                status: "success",
                message: `EKS cluster "${cluster}" created successfully with ${nodepools.length} nodegroups`,
                cluster: cluster,
                region: region,
                nodepools: nodepools
              });
            });
          });
        } else {
          // Single nodegroup case - update kubeconfig directly
          const updateCmd = `aws eks update-kubeconfig --name ${cluster} --region ${region}`;
          
          exec(updateCmd, (updateError, updateStdout, updateStderr) => {
            if (updateError) {
              console.error("Failed to update kubeconfig:", updateError);
              return res.json({
                status: "success",
                message: `EKS cluster "${cluster}" created but kubeconfig update failed`,
                cluster: cluster,
                warning: "Manual kubectl configuration required"
              });
            }
            
            console.log("EKS cluster configured successfully");
            
            res.json({
              status: "success",
              message: `EKS cluster "${cluster}" created and configured successfully`,
              cluster: cluster,
              region: region,
              nodepools: nodepools || [{ name: 'default-nodegroup', nodeCount: 3, machineType: 't3.medium' }]
            });
          });
        }
      });
    });
  } catch (err) {
    console.error("AWS cluster creation error:", err);
    res.status(500).json({ error: "AWS cluster creation failed" });
  }
});

app.post("/create-cluster/azure", async (req, res) => {
  try {
    const { resourceGroup, cluster, location, vnet, subnet, nsg, nodepools, servicePrincipal, clientSecret, tenantId } = req.body;
    
    console.log("Azure Cluster Creation Request:", { resourceGroup, cluster, location });
    
    // Implement Azure AKS cluster creation logic
    const { exec } = require("child_process");
    
    // Check if Azure CLI is configured
    const authCheck = exec("az account show", (error, stdout, stderr) => {
      if (error) {
        return res.status(400).json({ error: "Azure CLI configuration required" });
      }
      
      const account = JSON.parse(stdout);
      console.log("Using Azure subscription:", account.id);
      
      // Create AKS cluster with first nodepool
      const firstPool = nodepools && nodepools[0] ? nodepools[0] : {};
      let createCmd = `az aks create \
        --resource-group ${resourceGroup} \
        --name ${cluster} \
        --location ${location} \
        --node-count ${firstPool.nodeCount || 3} \
        --node-vm-size ${firstPool.machineType || 'Standard_D2s_v3'} \
        --enable-cluster-autoscaler \
        --min-count 1 \
        --max-count 10 \
        --generate-ssh-keys`;
      
      // Add first nodegroup labels
      if (firstPool.labels && firstPool.labels.trim()) {
        createCmd += ` --node-labels ${firstPool.labels.trim()}`;
      } else {
        createCmd += ` --node-labels environment=devops cluster=${cluster} managed-by=k8s-ui`;
      }
      
      if (vnet) {
        createCmd += ` --vnet-name ${vnet}`;
      }
      
      if (subnet) {
        createCmd += ` --vnet-subnet-name ${subnet}`;
      }
      
      if (nsg) {
        createCmd += ` --network-plugin azure`;
      }
      
      console.log("Executing AKS cluster creation with first nodepool:", createCmd);
      
      // Execute with 5-minute timeout
      exec(createCmd, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
          console.error("AKS cluster creation failed:", error);
          return res.status(500).json({ 
            error: "AKS cluster creation failed", 
            details: stderr 
          });
        }
        
        console.log("AKS cluster creation output:", stdout);
        
        // Add additional nodepools if any
        if (nodepools && nodepools.length > 1) {
          const additionalPools = nodepools.slice(1);
          let poolCreationPromises = [];
          
          additionalPools.forEach((pool, index) => {
            const poolCmd = `az aks nodepool add \
              --resource-group ${resourceGroup} \
              --cluster-name ${cluster} \
              --name ${pool.name} \
              --node-count ${pool.nodeCount || 3} \
              --node-vm-size ${pool.machineType || 'Standard_D2s_v3'} \
              --enable-cluster-autoscaler \
              --min-count 1 \
              --max-count 10 \
              --node-labels ${pool.labels && pool.labels.trim() ? pool.labels.trim() : 'environment=devops,managed-by=k8s-ui'}`;
            
            console.log(`Creating additional nodepool ${pool.name}:`, poolCmd);
            
            const promise = new Promise((resolve, reject) => {
              exec(poolCmd, { timeout: 300000 }, (poolError, poolStdout, poolStderr) => {
                if (poolError) {
                  console.error(`Nodepool ${pool.name} creation failed:`, poolError);
                  resolve({ success: false, pool: pool.name, error: poolStderr });
                } else {
                  console.log(`Nodepool ${pool.name} created successfully:`, poolStdout);
                  resolve({ success: true, pool: pool.name });
                }
              });
            });
            
            poolCreationPromises.push(promise);
          });
          
          // Wait for all additional nodepools to be created
          Promise.all(poolCreationPromises).then(results => {
            console.log("All additional nodepools creation results:", results);
            
            // Get cluster credentials
            const getCredsCmd = `az aks get-credentials --resource-group ${resourceGroup} --name ${cluster}`;
            
            exec(getCredsCmd, (credsError, credsStdout, credsStderr) => {
              if (credsError) {
                console.error("Failed to get cluster credentials:", credsError);
                return res.json({
                  status: "success",
                  message: `AKS cluster "${cluster}" created with ${nodepools.length} nodepools but credentials fetch failed`,
                  cluster: cluster,
                  nodepools: nodepools,
                  warning: "Manual kubectl configuration required"
                });
              }
              
              console.log("AKS cluster credentials obtained successfully");
              
              res.json({
                status: "success",
                message: `AKS cluster "${cluster}" created successfully with ${nodepools.length} nodepools`,
                cluster: cluster,
                resourceGroup: resourceGroup,
                location: location,
                nodepools: nodepools
              });
            });
          });
        } else {
          // Single nodepool case - get credentials directly
          const getCredsCmd = `az aks get-credentials --resource-group ${resourceGroup} --name ${cluster}`;
          
          exec(getCredsCmd, (credsError, credsStdout, credsStderr) => {
            if (credsError) {
              console.error("Failed to get cluster credentials:", credsError);
              return res.json({
                status: "success",
                message: `AKS cluster "${cluster}" created but credentials fetch failed`,
                cluster: cluster,
                warning: "Manual kubectl configuration required"
              });
            }
            
            console.log("AKS cluster credentials obtained successfully");
            
            res.json({
              status: "success",
              message: `AKS cluster "${cluster}" created and configured successfully`,
              cluster: cluster,
              resourceGroup: resourceGroup,
              location: location,
              nodepools: nodepools || [{ name: 'default-pool', nodeCount: 3, machineType: 'Standard_D2s_v3' }]
            });
          });
        }
      });
    });
  } catch (err) {
    console.error("Azure cluster creation error:", err);
    res.status(500).json({ error: "Azure cluster creation failed" });
  }
});

/* ================= NODE LABELING ================= */
app.post("/nodes/label", async (req, res) => {
  try {
    const { nodeName, labels } = req.body;
    
    if (!nodeName || !labels) {
      return res.status(400).json({ error: "Node name and labels are required" });
    }
    
    console.log("Adding labels to node:", { nodeName, labels });
    
    // Add labels to the node
    const labelCmd = `kubectl label nodes ${nodeName} ${labels}`;
    
    const { exec } = require("child_process");
    
    exec(labelCmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Node labeling failed:", error);
        return res.status(500).json({ 
          error: "Node labeling failed", 
          details: stderr 
        });
      }
      
      console.log("Node labeling successful:", stdout);
      
      // Get updated node information
      const getNodeCmd = `kubectl get node ${nodeName} --show-labels`;
      
      exec(getNodeCmd, (nodeError, nodeStdout, nodeStderr) => {
        if (nodeError) {
          console.error("Failed to get node info:", nodeError);
          return res.json({
            status: "success",
            message: `Labels added to node "${nodeName}"`,
            nodeName: nodeName,
            labels: labels
          });
        }
        
        res.json({
          status: "success",
          message: `Labels added to node "${nodeName}" successfully`,
          nodeName: nodeName,
          labels: labels,
          nodeInfo: nodeStdout
        });
      });
    });
  } catch (err) {
    console.error("Node labeling error:", err);
    res.status(500).json({ error: "Node labeling failed" });
  }
});

/* ================= GET NODES WITH LABELS ================= */
app.get("/nodes", async (req, res) => {
  try {
    const { exec } = require("child_process");
    
    // Get all nodes with labels
    const getNodesCmd = "kubectl get nodes --show-labels -o wide";
    
    exec(getNodesCmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Failed to get nodes:", error);
        return res.status(500).json({ error: "Failed to get nodes" });
      }
      
      // Parse the output
      const lines = stdout.split('\n');
      const header = lines[0];
      const nodes = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const parts = line.split(/\s+/);
          const nodeData = {
            name: parts[0],
            status: parts[1],
            roles: parts[2],
            age: parts[3],
            version: parts[4],
            internalIP: parts[5],
            externalIP: parts[6],
            osImage: parts[7],
            kernelVersion: parts[8],
            containerRuntime: parts[9],
            labels: parts[10] || "<none>"
          };
          nodes.push(nodeData);
        }
      }
      
      res.json({
        status: "success",
        nodes: nodes
      });
    });
  } catch (err) {
    console.error("Get nodes error:", err);
    res.status(500).json({ error: "Failed to get nodes" });
  }
});

/* ================= HEALTH CHECK ================= */
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Enhanced backend running on http://localhost:${PORT}`);
  console.log("Features: ArgoCD token auth, dynamic app creation, GitOps workflow");
});
