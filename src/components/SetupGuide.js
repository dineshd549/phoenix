import { useState } from "react";

export default function SetupGuide() {
  const [activeTab, setActiveTab] = useState("prerequisites");

  const prerequisites = [
    {
      title: "Install Required Tools",
      items: [
        "kubectl - Kubernetes CLI",
        "helm - Package manager for Kubernetes", 
        "argocd - GitOps continuous delivery tool",
        "Cloud CLI (gcloud/aws-cli/az) based on your provider"
      ]
    },
    {
      title: "Cloud Provider Setup",
      items: [
      "Create cloud account (GCP/AWS/Azure)",
        "Enable Kubernetes Engine/EKS/AKS service",
        "Set up billing and permissions"
      ]
    },
    {
      title: "Git Repository",
      items: [
        "Clone your Helm charts repository",
        "Ensure ArgoCD is configured to watch this repo",
        "Have admin access to push changes"
      ]
    }
  ];

  const deploymentFlow = [
    {
      step: "1",
      title: "Upload Kubeconfig",
      description: "Upload your Kubernetes configuration file to connect to your cluster"
    },
    {
      step: "2", 
      title: "Select Cloud & Cluster",
      description: "Choose your cloud provider and select or create a cluster"
    },
    {
      step: "3",
      title: "Configure Namespace",
      description: "Select an existing namespace or create a new one"
    },
    {
      step: "4",
      title: "Choose Services",
      description: "Select which services to deploy (e.g., mysql, redis, nginx)"
    },
    {
      step: "5",
      title: "Set Environment Variables",
      description: "Add any required environment variables for your services"
    },
    {
      step: "6",
      title: "Deploy via ArgoCD",
      description: "Click deploy to push changes to Git and trigger ArgoCD sync"
    }
  ];

  const credentialRequirements = {
    gcp: {
      title: "Google Cloud Platform",
      icon: "☁️",
      needs: [
        "Project ID with billing enabled",
        "Service Account JSON key with Kubernetes Engine Admin role",
        "gcloud CLI installed and authenticated"
      ]
    },
    aws: {
      title: "Amazon Web Services",
      icon: "🔶", 
      needs: [
        "AWS Account ID",
        "IAM User with EKS permissions",
        "Access Key ID and Secret Access Key",
        "aws CLI installed"
      ]
    },
    azure: {
      title: "Microsoft Azure",
      icon: "🔵",
      needs: [
        "Azure Subscription",
        "Service Principal with AKS permissions",
        "Tenant ID, Client ID, and Client Secret",
        "az CLI installed"
      ]
    }
  };

  return (
    <div style={{padding: "20px", backgroundColor: "#f8f9fa", borderRadius: "8px", marginBottom: "20px"}}>
      <h3>🚀 Quick Setup Guide for Beginners</h3>
      
      <div style={{marginBottom: "15px"}}>
        <button 
          onClick={() => setActiveTab("prerequisites")}
          style={{
            marginRight: "10px",
            padding: "8px 16px",
            backgroundColor: activeTab === "prerequisites" ? "#007bff" : "#e9ecef",
            color: activeTab === "prerequisites" ? "white" : "black",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Prerequisites
        </button>
        <button 
          onClick={() => setActiveTab("flow")}
          style={{
            marginRight: "10px", 
            padding: "8px 16px",
            backgroundColor: activeTab === "flow" ? "#007bff" : "#e9ecef",
            color: activeTab === "flow" ? "white" : "black",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Deployment Flow
        </button>
        <button 
          onClick={() => setActiveTab("credentials")}
          style={{
            padding: "8px 16px",
            backgroundColor: activeTab === "credentials" ? "#007bff" : "#e9ecef",
            color: activeTab === "credentials" ? "white" : "black",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Credentials Needed
        </button>
      </div>

      {activeTab === "prerequisites" && (
        <div>
          <h4>📋 What You Need Before Starting</h4>
          {prerequisites.map((section, i) => (
            <div key={i} style={{marginBottom: "15px"}}>
              <strong>{section.title}:</strong>
              <ul style={{margin: "5px 0", paddingLeft: "20px"}}>
                {section.items.map((item, j) => (
                  <li key={j} style={{fontSize: "14px"}}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {activeTab === "flow" && (
        <div>
          <h4>🔄 Step-by-Step Deployment Process</h4>
          {deploymentFlow.map((step) => (
            <div key={step.step} style={{display: "flex", marginBottom: "15px"}}>
              <div style={{
                minWidth: "30px",
                height: "30px",
                backgroundColor: "#007bff",
                color: "white",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: "15px"
              }}>
                {step.step}
              </div>
              <div>
                <strong>{step.title}</strong>
                <p style={{margin: "2px 0", fontSize: "14px", color: "#666"}}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "credentials" && (
        <div>
          <h4>🔐 Cloud Provider Credentials</h4>
          {Object.entries(credentialRequirements).map(([key, provider]) => (
            <div key={key} style={{marginBottom: "15px"}}>
              <div style={{display: "flex", alignItems: "center", marginBottom: "5px"}}>
                <span style={{marginRight: "10px"}}>{provider.icon}</span>
                <strong>{provider.title}</strong>
              </div>
              <ul style={{margin: "5px 0", paddingLeft: "30px"}}>
                {provider.needs.map((need, i) => (
                  <li key={i} style={{fontSize: "14px"}}>{need}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
