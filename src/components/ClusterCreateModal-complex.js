import { useState } from "react";
import { createCluster } from "../api/api";
import { CredentialHelper } from "./CredentialHelper";

export default function ClusterCreateModal({ cloud, onClose, onClusterCreated }) {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nodepools, setNodepools] = useState([
    { name: 'default-pool', nodeCount: 3, machineType: 'e2-medium', labels: 'environment=devops,managed-by=k8s-ui' }
  ]);

  const addNodepool = () => {
    setNodepools([...nodepools, { 
      name: `pool-${nodepools.length + 1}`, 
      nodeCount: 3, 
      machineType: 'e2-medium', 
      labels: 'environment=devops,managed-by=k8s-ui' 
    }]);
  };

  const removeNodepool = (index) => {
    if (nodepools.length > 1) {
      setNodepools(nodepools.filter((_, i) => i !== index));
    }
  };

  const updateNodepool = (index, field, value) => {
    const updated = [...nodepools];
    updated[index][field] = value;
    setNodepools(updated);
  };

  const validateForm = () => {
    if (cloud === "gcp") {
      if (!formData.project) return "Project ID is required";
      if (!formData.cluster) return "Cluster name is required";
      if (!formData.zone) return "Zone is required";
      if (!formData.credentials) return "Service Account JSON key is required";
    }
    
    if (cloud === "aws") {
      if (!formData.cluster) return "Cluster name is required";
      if (!formData.accountId) return "AWS Account ID is required";
      if (!formData.accessKeyId) return "Access Key ID is required";
      if (!formData.secretAccessKey) return "Secret Access Key is required";
    }
    
    if (cloud === "azure") {
      if (!formData.resourceGroup) return "Resource Group is required";
      if (!formData.cluster) return "Cluster name is required";
      if (!formData.servicePrincipal) return "Service Principal is required";
      if (!formData.clientSecret) return "Client Secret is required";
      if (!formData.tenantId) return "Tenant ID is required";
    }
    
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError("❌ " + validationError);
      return;
    }
    
    setLoading(true);
    setError("");

    try {
      // Include nodepools in the request
      const payload = { ...formData, nodepools };
      const response = await createCluster[cloud](payload);
      
      if (response.data.status === "success") {
        alert( response.data.message);
        onClusterCreated();
        onClose();
      } else {
        setError( response.data.message);
      }
    } catch (err) {
      setError(" Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    switch (cloud) {
      case "gcp":
        return (
          <>
            <div>
              <label>Project ID:</label>
              <input
                type="text"
                placeholder="my-gcp-project"
                value={formData.project || ""}
                onChange={(e) => setFormData({...formData, project: e.target.value})}
                required
              />
              <small style={{color: "#666", fontSize: "12px"}}>
                💡 Get this from GCP Console → Project Settings
              </small>
            </div>
            <div>
              <label>Cluster Name:</label>
              <input
                type="text"
                placeholder="my-gke-cluster"
                value={formData.cluster || ""}
                onChange={(e) => setFormData({...formData, cluster: e.target.value})}
                required
              />
            </div>
            <div>
              <label>Zone:</label>
              <input
                type="text"
                placeholder="us-central1-a"
                value={formData.zone || ""}
                onChange={(e) => setFormData({...formData, zone: e.target.value})}
                required
              />
              <small style={{color: "#666", fontSize: "12px"}}>
                💡 Choose a zone near you (e.g., us-central1-a)
              </small>
            </div>
            <div>
              <label>Network (VPC):</label>
              <input
                type="text"
                placeholder="default"
                value={formData.network || ""}
                onChange={(e) => setFormData({...formData, network: e.target.value})}
              />
            </div>
            <div>
              <label>Subnet:</label>
              <input
                type="text"
                placeholder="default"
                value={formData.subnetwork || ""}
                onChange={(e) => setFormData({...formData, subnetwork: e.target.value})}
              />
            </div>
            <div>
              <label>Network Tags:</label>
              <input
                type="text"
                placeholder="web-server,database"
                value={formData.networkTags || ""}
                onChange={(e) => setFormData({...formData, networkTags: e.target.value})}
              />
            </div>
            
            {/* Nodepool Management */}
            <div style={{marginTop: '20px'}}>
              <h4 style={{marginBottom: '15px', color: '#333'}}>
                🏗️ Nodepools Configuration
                <button 
                  type="button"
                  onClick={addNodepool}
                  style={{
                    marginLeft: '10px',
                    padding: '5px 10px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  + Add Nodepool
                </button>
              </h4>
              
              {nodepools.map((pool, index) => (
                <div key={index} style={{
                  border: '1px solid #ddd',
                  padding: '15px',
                  marginBottom: '10px',
                  borderRadius: '8px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                    <h5 style={{margin: 0, color: '#555'}}>Nodepool: {pool.name}</h5>
                    {nodepools.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeNodepool(index)}
                        style={{
                          padding: '3px 8px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px'}}>
                    <div>
                      <label>Pool Name:</label>
                      <input
                        type="text"
                        value={pool.name}
                        onChange={(e) => updateNodepool(index, 'name', e.target.value)}
                        style={{width: '100%'}}
                      />
                    </div>
                    <div>
                      <label>Number of Nodes:</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={pool.nodeCount}
                        onChange={(e) => updateNodepool(index, 'nodeCount', parseInt(e.target.value))}
                        style={{width: '100%'}}
                      />
                    </div>
                  </div>
                  
                  <div style={{marginBottom: '10px'}}>
                    <label>Machine Type:</label>
                    <select
                      value={pool.machineType}
                      onChange={(e) => updateNodepool(index, 'machineType', e.target.value)}
                      style={{width: '100%'}}
                    >
                      <option value="e2-medium">e2-medium</option>
                      <option value="e2-standard-2">e2-standard-2</option>
                      <option value="e2-standard-4">e2-standard-4</option>
                      <option value="n1-standard-2">n1-standard-2</option>
                      <option value="n1-standard-4">n1-standard-4</option>
                    </select>
                  </div>
                  
                  <div>
                    <label>Nodepool Labels:</label>
                    <textarea
                      value={pool.labels}
                      onChange={(e) => updateNodepool(index, 'labels', e.target.value)}
                      rows="2"
                      placeholder="environment=devops workload=database"
                      style={{width: '100%'}}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label>Service Account Key (JSON):</label>
              <textarea
                placeholder="Paste GCP service account key JSON here..."
                value={formData.credentials || ""}
                onChange={(e) => setFormData({...formData, credentials: e.target.value})}
                rows="4"
                required
              />
              <small style={{color: "#666", fontSize: "12px"}}>
                💡 Create Service Account → Keys → Add Key → JSON
              </small>
            </div>
          </>
        );

      case "aws":
        return (
          <>
            <div>
              <label>Cluster Name:</label>
              <input
                type="text"
                placeholder="my-eks-cluster"
                value={formData.cluster || ""}
                onChange={(e) => setFormData({...formData, cluster: e.target.value})}
                required
              />
            </div>
            <div>
              <label>Region:</label>
              <select
                value={formData.region || "us-east-1"}
                onChange={(e) => setFormData({...formData, region: e.target.value})}
              >
                <option value="us-east-1">us-east-1</option>
                <option value="us-west-2">us-west-2</option>
                <option value="eu-west-1">eu-west-1</option>
                <option value="ap-southeast-1">ap-southeast-1</option>
              </select>
            </div>
            <div>
              <label>AWS Account ID:</label>
              <input
                type="text"
                placeholder="123456789012"
                value={formData.accountId || ""}
                onChange={(e) => setFormData({...formData, accountId: e.target.value})}
                required
              />
            </div>
            <div>
              <label>VPC ID:</label>
              <input
                type="text"
                placeholder="vpc-12345678"
                value={formData.vpcId || ""}
                onChange={(e) => setFormData({...formData, vpcId: e.target.value})}
              />
            </div>
            <div>
              <label>Subnet IDs (comma-separated):</label>
              <input
                type="text"
                placeholder="subnet-12345,subnet-67890"
                value={formData.subnetIds?.join(",") || ""}
                onChange={(e) => setFormData({...formData, subnetIds: e.target.value.split(",").map(s => s.trim())})}
              />
            </div>
            <div>
              <label>Security Group IDs (comma-separated):</label>
              <input
                type="text"
                placeholder="sg-12345,sg-67890"
                value={formData.securityGroupIds?.join(",") || ""}
                onChange={(e) => setFormData({...formData, securityGroupIds: e.target.value.split(",").map(s => s.trim())})}
              />
            </div>
            
            {/* Nodegroup Management */}
            <div style={{marginTop: '20px'}}>
              <h4 style={{marginBottom: '15px', color: '#333'}}>
                🏗️ Nodegroups Configuration
                <button 
                  type="button"
                  onClick={addNodepool}
                  style={{
                    marginLeft: '10px',
                    padding: '5px 10px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  + Add Nodegroup
                </button>
              </h4>
              
              {nodepools.map((pool, index) => (
                <div key={index} style={{
                  border: '1px solid #ddd',
                  padding: '15px',
                  marginBottom: '10px',
                  borderRadius: '8px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                    <h5 style={{margin: 0, color: '#555'}}>Nodegroup: {pool.name}</h5>
                    {nodepools.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeNodepool(index)}
                        style={{
                          padding: '3px 8px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px'}}>
                    <div>
                      <label>Group Name:</label>
                      <input
                        type="text"
                        value={pool.name}
                        onChange={(e) => updateNodepool(index, 'name', e.target.value)}
                        style={{width: '100%'}}
                      />
                    </div>
                    <div>
                      <label>Number of Nodes:</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={pool.nodeCount}
                        onChange={(e) => updateNodepool(index, 'nodeCount', parseInt(e.target.value))}
                        style={{width: '100%'}}
                      />
                    </div>
                  </div>
                  
                  <div style={{marginBottom: '10px'}}>
                    <label>Instance Type:</label>
                    <select
                      value={pool.machineType}
                      onChange={(e) => updateNodepool(index, 'machineType', e.target.value)}
                      style={{width: '100%'}}
                    >
                      <option value="t3.medium">t3.medium</option>
                      <option value="t3.large">t3.large</option>
                      <option value="m5.large">m5.large</option>
                      <option value="m5.xlarge">m5.xlarge</option>
                    </select>
                  </div>
                  
                  <div>
                    <label>Nodegroup Labels:</label>
                    <textarea
                      value={pool.labels}
                      onChange={(e) => updateNodepool(index, 'labels', e.target.value)}
                      rows="2"
                      placeholder="environment=devops workload=database"
                      style={{width: '100%'}}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label>Subnet IDs (comma-separated):</label>
              <input
                type="text"
                placeholder="subnet-12345,subnet-67890"
                value={formData.subnetIds?.join(",") || ""}
                onChange={(e) => setFormData({...formData, subnetIds: e.target.value.split(",").map(s => s.trim())})}
              />
            </div>
            <div>
              <label>Access Key ID:</label>
              <input
                type="text"
                placeholder="AKIAIOSFODNN7EXAMPLE"
                value={formData.accessKeyId || ""}
                onChange={(e) => setFormData({...formData, accessKeyId: e.target.value})}
              />
            </div>
            <div>
              <label>Secret Access Key:</label>
              <input
                type="password"
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                value={formData.secretAccessKey || ""}
                onChange={(e) => setFormData({...formData, secretAccessKey: e.target.value})}
              />
            </div>
          </>
        );

      case "azure":
        return (
          <>
            <div>
              <label>Resource Group:</label>
              <input
                type="text"
                placeholder="my-rg"
                value={formData.resourceGroup || ""}
                onChange={(e) => setFormData({...formData, resourceGroup: e.target.value})}
                required
              />
            </div>
            <div>
              <label>Cluster Name:</label>
              <input
                type="text"
                placeholder="my-aks-cluster"
                value={formData.cluster || ""}
                onChange={(e) => setFormData({...formData, cluster: e.target.value})}
                required
              />
            </div>
            <div>
              <label>Location:</label>
              <select
                value={formData.location || "eastus"}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
              >
                <option value="eastus">East US</option>
                <option value="westus2">West US 2</option>
                <option value="westeurope">West Europe</option>
                <option value="southeastasia">Southeast Asia</option>
              </select>
            </div>
            <div>
              <label>Virtual Network (VNet):</label>
              <input
                type="text"
                placeholder="my-vnet"
                value={formData.vnet || ""}
                onChange={(e) => setFormData({...formData, vnet: e.target.value})}
              />
            </div>
            <div>
              <label>Subnet Name:</label>
              <input
                type="text"
                placeholder="my-subnet"
                value={formData.subnet || ""}
                onChange={(e) => setFormData({...formData, subnet: e.target.value})}
              />
            </div>
            <div>
              <label>Network Security Group:</label>
              <input
                type="text"
                placeholder="my-nsg"
                value={formData.nsg || ""}
                onChange={(e) => setFormData({...formData, nsg: e.target.value})}
              />
            </div>
            
            {/* Nodegroup Management */}
            <div style={{marginTop: '20px'}}>
              <h4 style={{marginBottom: '15px', color: '#333'}}>
                🏗️ Nodegroups Configuration
                <button 
                  type="button"
                  onClick={addNodepool}
                  style={{
                    marginLeft: '10px',
                    padding: '5px 10px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  + Add Nodegroup
                </button>
              </h4>
              
              {nodepools.map((pool, index) => (
                <div key={index} style={{
                  border: '1px solid #ddd',
                  padding: '15px',
                  marginBottom: '10px',
                  borderRadius: '8px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                    <h5 style={{margin: 0, color: '#555'}}>Nodegroup: {pool.name}</h5>
                    {nodepools.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeNodepool(index)}
                        style={{
                          padding: '3px 8px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px'}}>
                    <div>
                      <label>Group Name:</label>
                      <input
                        type="text"
                        value={pool.name}
                        onChange={(e) => updateNodepool(index, 'name', e.target.value)}
                        style={{width: '100%'}}
                      />
                    </div>
                    <div>
                      <label>Number of Nodes:</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={pool.nodeCount}
                        onChange={(e) => updateNodepool(index, 'nodeCount', parseInt(e.target.value))}
                        style={{width: '100%'}}
                      />
                    </div>
                  </div>
                  
                  <div style={{marginBottom: '10px'}}>
                    <label>VM Size:</label>
                    <select
                      value={pool.machineType}
                      onChange={(e) => updateNodepool(index, 'machineType', e.target.value)}
                      style={{width: '100%'}}
                    >
                      <option value="Standard_D2s_v3">Standard_D2s_v3</option>
                      <option value="Standard_D4s_v3">Standard_D4s_v3</option>
                      <option value="Standard_D8s_v3">Standard_D8s_v3</option>
                      <option value="Standard_F2s_v2">Standard_F2s_v2</option>
                    </select>
                  </div>
                  
                  <div>
                    <label>Nodegroup Labels:</label>
                    <textarea
                      value={pool.labels}
                      onChange={(e) => updateNodepool(index, 'labels', e.target.value)}
                      rows="2"
                      placeholder="environment=devops workload=database"
                      style={{width: '100%'}}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label>Service Principal:</label>
              <input
                type="text"
                placeholder="http://my-sp"
                value={formData.servicePrincipal || ""}
                onChange={(e) => setFormData({...formData, servicePrincipal: e.target.value})}
              />
            </div>
            <div>
              <label>Client Secret:</label>
              <input
                type="password"
                placeholder="client-secret"
                value={formData.clientSecret || ""}
                onChange={(e) => setFormData({...formData, clientSecret: e.target.value})}
              />
            </div>
            <div>
              <label>Tenant ID:</label>
              <input
                type="text"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={formData.tenantId || ""}
                onChange={(e) => setFormData({...formData, tenantId: e.target.value})}
              />
            </div>
          </>
        );

      default:
        return <div>Please select a cloud provider first</div>;
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: "white",
        padding: "20px",
        borderRadius: "8px",
        minWidth: "500px",
        maxHeight: "90vh",
        overflowY: "auto"
      }}>
        <h3>Create New {cloud.toUpperCase()} Cluster</h3>
        <p style={{fontSize: "14px", color: "#666", marginBottom: "20px"}}>
          Follow the credential guide below to get started
        </p>
        
        {error && <div style={{color: "red", marginBottom: "10px"}}>{error}</div>}
        
        <CredentialHelper cloud={cloud} />
        
        <form onSubmit={handleSubmit}>
          {renderForm()}
          
          <div style={{marginTop: "20px", display: "flex", gap: "10px"}}>
            <button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Cluster"}
            </button>
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
