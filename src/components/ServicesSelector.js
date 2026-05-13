export default function ServicesSelector({ services, setServices }) {
  console.log("ServicesSelector received services:", services);

  if (!services || Object.keys(services).length === 0) {
    return <div>Loading services...</div>;
  }

  const toggle = (svc) => {
    setServices(prev => ({
      ...prev,
      [svc]: !prev[svc]
    }));
  };

  const selectAll = () => {
    const allServices = {};
    Object.keys(services).forEach(svc => {
      allServices[svc] = true;
    });
    setServices(allServices);
  };

  const selectNone = () => {
    const allServices = {};
    Object.keys(services).forEach(svc => {
      allServices[svc] = false;
    });
    setServices(allServices);
  };

  const allSelected = Object.values(services).every(val => val === true);
  const noneSelected = Object.values(services).every(val => val === false);

  return (
    <div>
      <h3>Services Selection</h3>
      
      <div style={{marginBottom: "10px"}}>
        <small style={{color: "#666", fontSize: "12px"}}>
          💡 Choose which services to deploy in your Kubernetes cluster
        </small>
      </div>
      
      <div style={{ marginBottom: "15px" }}>
        <button 
          onClick={selectAll} 
          disabled={allSelected}
          style={{ 
            marginRight: "10px", 
            padding: "8px 16px",
            backgroundColor: allSelected ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: allSelected ? "not-allowed" : "pointer",
            fontSize: "14px"
          }}
        >
          ✅ Select All
        </button>
        <button 
          onClick={selectNone} 
          disabled={noneSelected}
          style={{ 
            padding: "8px 16px",
            backgroundColor: noneSelected ? "#ccc" : "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: noneSelected ? "not-allowed" : "pointer",
            fontSize: "14px"
          }}
        >
          ❌ Select None
        </button>
        <span style={{marginLeft: "15px", fontSize: "14px", color: "#666"}}>
          {Object.values(services).filter(val => val === true).length} of {Object.keys(services).length} selected
        </span>
      </div>

      <div style={{ 
        border: "1px solid #ddd", 
        borderRadius: "4px", 
        padding: "15px",
        backgroundColor: "#f9f9f9",
        maxHeight: "300px",
        overflowY: "auto"
      }}>
        {Object.keys(services).map(svc => (
          <div key={svc} style={{ 
            marginBottom: "8px",
            padding: "8px",
            backgroundColor: "white",
            borderRadius: "4px",
            border: "1px solid #eee",
            display: "flex",
            alignItems: "center"
          }}>
            <input
              type="checkbox"
              id={`service-${svc}`}
              checked={services[svc] || false}
              onChange={() => toggle(svc)}
              style={{ marginRight: "10px", transform: "scale(1.2)" }}
            />
            <label 
              htmlFor={`service-${svc}`}
              style={{ 
                cursor: "pointer",
                fontWeight: services[svc] ? "bold" : "normal",
                color: services[svc] ? "#007bff" : "#333",
                flex: 1
              }}
            >
              {svc.charAt(0).toUpperCase() + svc.slice(1)}
              {services[svc] && <span style={{marginLeft: "8px", fontSize: "12px", color: "#28a745"}}>✓</span>}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}