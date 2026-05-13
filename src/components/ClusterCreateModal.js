import { useState, useEffect } from "react";
import { createCluster } from "../api/api";

export default function ClusterCreateModal({ cloud, onClose, onClusterCreated }) {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creationStatus, setCreationStatus] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(null);

  // Poll for cluster status
  const pollClusterStatus = (clusterName) => {
    console.log(`Starting to poll for cluster: ${clusterName}`);
    
    const interval = setInterval(async () => {
      try {
        // Import getClusters dynamically to avoid circular imports
        const { getClusters } = await import("../api/api");
        const response = await getClusters(cloud);
        const clusters = response.data || [];
        const foundCluster = clusters.find(c => c.name === clusterName);
        
        if (foundCluster) {
          console.log(`Cluster ${clusterName} found and accessible!`);
          clearInterval(interval);
          setPollingInterval(null);
          setCreationStatus({
            status: "success",
            message: `Cluster "${clusterName}" created successfully!`,
            cluster: foundCluster
          });
          setIsCreating(false);
          
          // Auto-close after 3 seconds and trigger callback
          setTimeout(() => {
            onClusterCreated(foundCluster);
            onClose();
          }, 3000);
        }
      } catch (error) {
        console.error("Error polling cluster status:", error);
      }
    }, 10000); // Poll every 10 seconds
    
    setPollingInterval(interval);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const validateForm = () => {
    if (cloud === "gcp") {
      if (!formData.project) return "Project ID is required";
      if (!formData.cluster) return "Cluster name is required";
      if (!formData.zone) return "Zone is required";
      if (!formData.credentials) return "Service Account JSON key is required";
      if (!formData.nodeLabels) return "Node labels are mandatory";
    }
    
    if (cloud === "aws") {
      if (!formData.cluster) return "Cluster name is required";
      if (!formData.accessKeyId) return "Access Key ID is required";
      if (!formData.secretAccessKey) return "Secret Access Key is required";
      if (!formData.region) return "Region is required";
      if (!formData.nodeLabels) return "Node labels are mandatory";
    }
    
    if (cloud === "azure") {
      if (!formData.resourceGroup) return "Resource Group is required";
      if (!formData.cluster) return "Cluster name is required";
      if (!formData.location) return "Location is required";
      if (!formData.servicePrincipal) return "Service Principal is required";
      if (!formData.clientSecret) return "Client Secret is required";
      if (!formData.tenantId) return "Tenant ID is required";
      if (!formData.nodeLabels) return "Node labels are mandatory";
    }
    
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");
    setCreationStatus(null);

    try {
      const response = await createCluster[cloud](formData);
      console.log("Cluster creation response:", response.data);
      
      // Handle different response statuses
      if (response.data.status === "started") {
        setIsCreating(true);
        setCreationStatus({
          status: "creating",
          message: response.data.message,
          estimatedTime: response.data.estimatedTime,
          cluster: response.data.cluster
        });
        
        // Start polling for cluster completion
        pollClusterStatus(response.data.cluster);
      } else if (response.data.status === "success") {
        // Immediate success (unlikely for cloud clusters)
        setCreationStatus({
          status: "success",
          message: response.data.message,
          cluster: response.data
        });
        
        setTimeout(() => {
          onClusterCreated(response.data);
          onClose();
        }, 2000);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Cluster creation failed");
      setIsCreating(false);
    } finally {
      setLoading(false);
    }
  };

  const renderGCPForm = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Project ID</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, project: e.target.value })}
          placeholder="your-project-id"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Service Account JSON Key</label>
        <textarea
          rows="6"
          onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          placeholder="Paste your GCP service account JSON key here"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Cluster Name</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, cluster: e.target.value })}
          placeholder="my-cluster"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Zone</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
        >
          <option value="">Select Zone</option>
          <option value="us-central1-a">us-central1-a</option>
          <option value="us-central1-b">us-central1-b</option>
          <option value="us-west1-a">us-west1-a</option>
          <option value="us-west1-b">us-west1-b</option>
          <option value="europe-west1-a">europe-west1-a</option>
          <option value="europe-west1-b">europe-west1-b</option>
          <option value="asia-south1-a">asia-south1-a</option>
          <option value="asia-south1-b">asia-south1-b</option>
          <option value="asia-south1-c">asia-south1-c</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Network (optional)</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, network: e.target.value })}
          placeholder="default"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Subnetwork (optional)</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, subnetwork: e.target.value })}
          placeholder="default"
        />
      </div>
      
      {/* Node Pool Configuration */}
      <div className="border-t pt-4">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Node Pool Configuration</h4>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Node Pool Name</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              onChange={(e) => setFormData({ ...formData, nodePoolName: e.target.value || 'default-pool' })}
              placeholder="default-pool"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Number of Nodes</label>
            <input
              type="number"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              onChange={(e) => setFormData({ ...formData, nodeCount: parseInt(e.target.value) || 3 })}
              placeholder="3"
              min="1"
              max="100"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Node Type (Machine Type)</label>
            <select
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              onChange={(e) => setFormData({ ...formData, machineType: e.target.value })}
            >
              <option value="e2-medium">e2-medium (2 vCPU, 4GB RAM)</option>
              <option value="e2-standard-2">e2-standard-2 (2 vCPU, 8GB RAM)</option>
              <option value="e2-standard-4">e2-standard-4 (4 vCPU, 16GB RAM)</option>
              <option value="e2-highmem-2">e2-highmem-2 (2 vCPU, 16GB RAM)</option>
              <option value="e2-highcpu-2">e2-highcpu-2 (2 vCPU, 2GB RAM)</option>
              <option value="n1-standard-2">n1-standard-2 (2 vCPU, 7.5GB RAM)</option>
              <option value="n1-standard-4">n1-standard-4 (4 vCPU, 15GB RAM)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Node Labels (mandatory)</label>
            <textarea
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              rows="3"
              onChange={(e) => setFormData({ ...formData, nodeLabels: e.target.value })}
              placeholder="environment=devops,managed-by=k8s-ui"
            />
            <p className="mt-1 text-sm text-gray-500">
              Enter labels in format: key1=value1,key2=value2 (mandatory field)
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAWSForm = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">AWS Access Key ID</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
          placeholder="AKIAIOSFODNN7EXAMPLE"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">AWS Secret Access Key</label>
        <input
          type="password"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
          placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Cluster Name</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, cluster: e.target.value })}
          placeholder="my-cluster"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Region</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, region: e.target.value })}
        >
          <option value="">Select Region</option>
          <option value="us-east-1">us-east-1 (N. Virginia)</option>
          <option value="us-west-2">us-west-2 (Oregon)</option>
          <option value="us-west-1">us-west-1 (N. California)</option>
          <option value="eu-west-1">eu-west-1 (Ireland)</option>
          <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
          <option value="ap-south-1">ap-south-1 (Mumbai)</option>
          <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">VPC ID (optional)</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, vpcId: e.target.value })}
          placeholder="vpc-12345678"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Subnet IDs (optional)</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, subnetIds: e.target.value.split(',').map(id => id.trim()).filter(id => id) })}
          placeholder="subnet-12345678, subnet-87654321"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Security Group IDs (optional)</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, securityGroupIds: e.target.value.split(',').map(id => id.trim()).filter(id => id) })}
          placeholder="sg-12345678, sg-87654321"
        />
      </div>
      
      {/* Node Pool Configuration */}
      <div className="border-t pt-4">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Node Pool Configuration</h4>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Node Pool Name</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              onChange={(e) => setFormData({ ...formData, nodePoolName: e.target.value || 'default' })}
              placeholder="default"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Number of Nodes</label>
            <input
              type="number"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              onChange={(e) => setFormData({ ...formData, nodeCount: parseInt(e.target.value) || 2 })}
              placeholder="2"
              min="1"
              max="100"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Node Type (Instance Type)</label>
            <select
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              onChange={(e) => setFormData({ ...formData, nodeType: e.target.value })}
            >
              <option value="t3.medium">t3.medium (2 vCPU, 4GB RAM)</option>
              <option value="t3.large">t3.large (2 vCPU, 8GB RAM)</option>
              <option value="t3.xlarge">t3.xlarge (4 vCPU, 16GB RAM)</option>
              <option value="m5.large">m5.large (2 vCPU, 8GB RAM)</option>
              <option value="m5.xlarge">m5.xlarge (4 vCPU, 16GB RAM)</option>
              <option value="c5.large">c5.large (2 vCPU, 4GB RAM)</option>
              <option value="c5.xlarge">c5.xlarge (4 vCPU, 8GB RAM)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Node Labels (mandatory)</label>
            <textarea
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              rows="3"
              onChange={(e) => setFormData({ ...formData, nodeLabels: e.target.value })}
              placeholder="environment=devops,managed-by=k8s-ui"
            />
            <p className="mt-1 text-sm text-gray-500">
              Enter labels in format: key1=value1,key2=value2 (mandatory field)
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAzureForm = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Service Principal App ID</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, servicePrincipal: e.target.value })}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Client Secret</label>
        <input
          type="password"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
          placeholder="client-secret-password"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Tenant ID</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Resource Group</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, resourceGroup: e.target.value })}
          placeholder="my-resource-group"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Cluster Name</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, cluster: e.target.value })}
          placeholder="my-cluster"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Location</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
        >
          <option value="">Select Location</option>
          <option value="eastus">East US</option>
          <option value="westus2">West US 2</option>
          <option value="centralus">Central US</option>
          <option value="westeurope">West Europe</option>
          <option value="southeastasia">Southeast Asia</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Virtual Network (optional)</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, vnet: e.target.value })}
          placeholder="my-vnet"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Subnet (optional)</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, subnet: e.target.value })}
          placeholder="my-subnet"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Network Security Group (optional)</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          onChange={(e) => setFormData({ ...formData, nsg: e.target.value })}
          placeholder="my-nsg"
        />
      </div>
      
      {/* Node Pool Configuration */}
      <div className="border-t pt-4">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Node Pool Configuration</h4>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Node Pool Name</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              onChange={(e) => setFormData({ ...formData, nodePoolName: e.target.value || 'nodepool1' })}
              placeholder="nodepool1"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Number of Nodes</label>
            <input
              type="number"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              onChange={(e) => setFormData({ ...formData, nodeCount: parseInt(e.target.value) || 3 })}
              placeholder="3"
              min="1"
              max="100"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Node Size (VM Size)</label>
            <select
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              onChange={(e) => setFormData({ ...formData, nodeSize: e.target.value })}
            >
              <option value="Standard_D2s_v3">Standard_D2s_v3 (2 vCPU, 8GB RAM)</option>
              <option value="Standard_D4s_v3">Standard_D4s_v3 (4 vCPU, 16GB RAM)</option>
              <option value="Standard_D8s_v3">Standard_D8s_v3 (8 vCPU, 32GB RAM)</option>
              <option value="Standard_F2s_v2">Standard_F2s_v2 (2 vCPU, 4GB RAM)</option>
              <option value="Standard_F4s_v2">Standard_F4s_v2 (4 vCPU, 8GB RAM)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Node Labels (mandatory)</label>
            <textarea
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              rows="3"
              onChange={(e) => setFormData({ ...formData, nodeLabels: e.target.value })}
              placeholder="environment=devops,managed-by=k8s-ui"
            />
            <p className="mt-1 text-sm text-gray-500">
              Enter labels in format: key1=value1,key2=value2 (mandatory field)
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // If cluster is being created, show progress screen
  if (isCreating) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)'}}>
        <div className="bg-white rounded-lg p-8 w-full max-w-lg" style={{backgroundColor: 'white', borderRadius: '8px', padding: '32px', margin: '20px'}}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-bold mb-4">
              Creating {cloud === "gcp" ? "GKE" : cloud === "aws" ? "EKS" : "AKS"} Cluster
            </h2>
            
            {creationStatus && (
              <div className="mb-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-800 font-medium">{creationStatus.message}</p>
                  {creationStatus.estimatedTime && (
                    <p className="text-blue-600 text-sm mt-2">
                      Estimated time: {creationStatus.estimatedTime}
                    </p>
                  )}
                  <p className="text-blue-600 text-sm mt-2">
                    Cluster name: <strong>{creationStatus.cluster}</strong>
                  </p>
                </div>
              </div>
            )}
            
            <div className="mb-4">
              <p className="text-gray-600 text-sm">
                The cluster is being created in the background. This window will automatically close when the cluster is ready.
              </p>
              <p className="text-gray-500 text-sm mt-2">
                You can safely close this window - the creation will continue in the background.
              </p>
            </div>
            
            <div className="flex justify-center space-x-3">
              <button
                type="button"
                onClick={() => {
                  if (pollingInterval) {
                    clearInterval(pollingInterval);
                  }
                  onClose();
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If creation succeeded, show success screen
  if (creationStatus && creationStatus.status === "success") {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)'}}>
        <div className="bg-white rounded-lg p-8 w-full max-w-lg" style={{backgroundColor: 'white', borderRadius: '8px', padding: '32px', margin: '20px'}}>
          <div className="text-center">
            <div className="text-green-600 text-5xl mb-4">Check!</div>
            <h2 className="text-xl font-bold mb-4 text-green-800">
              Cluster Created Successfully!
            </h2>
            
            <div className="mb-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-medium">{creationStatus.message}</p>
                <p className="text-green-600 text-sm mt-2">
                  This window will close automatically in 3 seconds...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)'}}>
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{position: 'relative', maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'white', borderRadius: '8px', padding: '24px', margin: '20px'}}>
        <h2 className="text-xl font-bold mb-4">
          Create {cloud === "gcp" ? "GKE" : cloud === "aws" ? "EKS" : "AKS"} Cluster
        </h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          {cloud === "gcp" && renderGCPForm()}
          {cloud === "aws" && renderAWSForm()}
          {cloud === "azure" && renderAzureForm()}
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading || isCreating}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || isCreating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Starting..." : "Create Cluster"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
