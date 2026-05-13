export const credentialGuides = {
  gcp: {
    title: "GCP Credentials Guide",
    prerequisites: [
      "GCP Project with billing enabled",
      "gcloud CLI installed",
      "Service Account with Kubernetes Engine Admin role"
    ],
    steps: [
      "Go to GCP Console → IAM & Admin → Service Accounts",
      "Create Service Account with 'Kubernetes Engine Admin' role",
      "Create and download JSON key",
      "Copy Project ID from project settings"
    ],
    fields: {
      project: "Your GCP Project ID (from project settings)",
      credentials: "Downloaded JSON key content"
    }
  },
  aws: {
    title: "AWS Credentials Guide", 
    prerequisites: [
      "AWS Account with EKS permissions",
      "AWS CLI installed",
      "IAM role for EKS service"
    ],
    steps: [
      "Create IAM user with EKS permissions",
      "Generate Access Key ID and Secret Access Key",
      "Create IAM role 'eks-service-role' with EKS policies",
      "Get Account ID from AWS console"
    ],
    fields: {
      accessKeyId: "AWS Access Key ID",
      secretAccessKey: "AWS Secret Access Key", 
      accountId: "12-digit AWS Account ID"
    }
  },
  azure: {
    title: "Azure Credentials Guide",
    prerequisites: [
      "Azure Subscription",
      "Azure CLI installed",
      "Service Principal with AKS permissions"
    ],
    steps: [
      "Create Service Principal: az ad sp create-for-rbac",
      "Copy App ID (Service Principal)",
      "Copy Password (Client Secret)",
      "Copy Tenant ID from Azure AD"
    ],
    fields: {
      servicePrincipal: "Service Principal App ID",
      clientSecret: "Service Principal Password",
      tenantId: "Azure AD Tenant ID"
    }
  }
};

export const CredentialHelper = ({ cloud, onCredentialsChange }) => {
  const guide = credentialGuides[cloud];
  if (!guide) return null;

  return (
    <div style={{marginTop: "20px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "8px"}}>
      <h4>{guide.title}</h4>
      
      {cloud === "gcp" && (
        <div style={{marginBottom: "15px"}}>
          <label className="block text-sm font-medium text-gray-700">Service Account JSON Key</label>
          <textarea
            rows="6"
            onChange={(e) => onCredentialsChange(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            placeholder="Paste your GCP service account JSON key here"
          />
        </div>
      )}
    </div>
  );
};
