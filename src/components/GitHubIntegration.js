import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";

const GitHubIntegration = ({ cluster }) => {
  const [githubConfig, setGithubConfig] = useState({
    repoUrl: "https://github.com/dview-io/onboarding.git",
    branch: "devops",
    username: "",
    token: "",
    path: "release/v3.0.0/v4.0.0"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [argoCDStatus, setArgoCDStatus] = useState(null);
  const [connected, setConnected] = useState(false);

  const checkArgoCDStatus = useCallback(async () => {
    try {
      const response = await axios.get(`http://localhost:8000/check-argocd/${cluster}`);
      setArgoCDStatus(response.data);
      setConnected(response.data.hasArgoCD);
    } catch (err) {
      console.error("Failed to check ArgoCD status:", err);
      setError("Failed to check ArgoCD status: " + err.message);
    }
  }, [cluster]);

  // Check ArgoCD status when cluster changes
  useEffect(() => {
    if (cluster) {
      checkArgoCDStatus();
    }
  }, [cluster, checkArgoCDStatus]);

  const connectGitHub = async () => {
    try {
      setLoading(true);
      setError("");

      // Step 1: Get ArgoCD initial password
      const passwordResponse = await axios.post(`http://localhost:8000/get-argocd-password`, {
        cluster: cluster
      });

      // Step 2: Login to ArgoCD and get token
      await axios.post(`http://localhost:8000/login-argocd`, {
        cluster: cluster,
        username: "admin",
        password: passwordResponse.data.password
      });

      // Step 3: Connect GitHub repository
      await axios.post(`http://localhost:8000/connect-github-repo`, {
        cluster: cluster,
        repoUrl: githubConfig.repoUrl,
        branch: githubConfig.branch,
        username: githubConfig.username,
        token: githubConfig.token,
        path: githubConfig.path
      });

      setConnected(true);
      alert("✅ GitHub repository connected successfully to ArgoCD!");
      
    } catch (err) {
      console.error("GitHub connection failed:", err);
      setError("Failed to connect GitHub: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const testDeployment = async () => {
    try {
      setLoading(true);
      setError("");

      await axios.post(`http://localhost:8000/deploy`, {
        deploymentName: "github-integration-test",
        namespace: "devops",
        cluster: cluster,
        services: {
          mysql: true,
          hive: false,
          redis: false,
          kafka: false,
          trino: false,
          apollo: false,
          cerebrum: false,
          artemis: false,
          dex: false,
          mirage: false,
          cosmos: false,
          trinity: false,
          dsense: false,
          rangeradmin: false,
          gitsync: false,
          cortex: false,
          jobviewer: false
        }
      });

      alert("✅ Test deployment successful! Check ArgoCD UI for the application.");
      
    } catch (err) {
      console.error("Test deployment failed:", err);
      setError("Test deployment failed: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  if (!cluster) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">🔗 GitHub Integration</h3>
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🔗</div>
          <p className="text-gray-600">Please select a cluster first to configure GitHub integration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">🔗 GitHub Integration</h3>
        <button
          onClick={checkArgoCDStatus}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-700 text-sm">⚠️ {error}</p>
        </div>
      )}

      {argoCDStatus && (
        <div className="mb-6 p-4 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-gray-900">ArgoCD Status</h4>
            <span className={`px-2 py-1 text-xs rounded-full ${
              argoCDStatus.hasArgoCD 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {argoCDStatus.hasArgoCD ? '✅ Connected' : '❌ Not Installed'}
            </span>
          </div>
          
          {argoCDStatus.hasArgoCD && (
            <div className="text-sm text-gray-600">
              <p><strong>Namespace:</strong> {argoCDStatus.argoCDNamespace}</p>
              <p><strong>Version:</strong> {argoCDStatus.argoCDVersion || 'Unknown'}</p>
            </div>
          )}
        </div>
      )}

      {argoCDStatus?.hasArgoCD && !connected && (
        <div className="space-y-4">
          <div className="border-t pt-4">
            <h4 className="font-medium text-gray-900 mb-3">Connect GitHub Repository</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Repository URL
                </label>
                <input
                  type="text"
                  value={githubConfig.repoUrl}
                  onChange={(e) => setGithubConfig({...githubConfig, repoUrl: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="https://github.com/user/repo.git"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Branch
                </label>
                <input
                  type="text"
                  value={githubConfig.branch}
                  onChange={(e) => setGithubConfig({...githubConfig, branch: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="main"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GitHub Username
                </label>
                <input
                  type="text"
                  value={githubConfig.username}
                  onChange={(e) => setGithubConfig({...githubConfig, username: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="your-github-username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Personal Access Token
                </label>
                <input
                  type="password"
                  value={githubConfig.token}
                  onChange={(e) => setGithubConfig({...githubConfig, token: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="ghp_xxxxxxxxxxxx"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Create a token at: github.com/settings/tokens
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chart Path (Optional)
                </label>
                <input
                  type="text"
                  value={githubConfig.path}
                  onChange={(e) => setGithubConfig({...githubConfig, path: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="release/v3.0.0/v4.0.0"
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-4">
              <button
                onClick={connectGitHub}
                disabled={loading || !githubConfig.username || !githubConfig.token}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {loading ? '⏳ Connecting...' : '🔗 Connect GitHub'}
              </button>
            </div>
          </div>
        </div>
      )}

      {connected && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center">
            <div className="text-green-600 mr-2">✅</div>
            <div>
              <p className="font-medium text-green-800">GitHub Connected Successfully!</p>
              <p className="text-sm text-green-700">
                Repository: {githubConfig.repoUrl}
              </p>
            </div>
          </div>
          
          <div className="mt-4">
            <button
              onClick={testDeployment}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? '⏳ Testing...' : '🧪 Test Deployment'}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              This will create a test deployment to verify the GitHub integration works.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitHubIntegration;
