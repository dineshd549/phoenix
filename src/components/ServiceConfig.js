export default function ServiceConfig({ services, config, setValues }) {

  if (!config) return null;

  const update = (svc, key, value) => {
    setValues(prev => ({
      ...prev,
      service: {
        ...prev.service,
        [svc]: {
          ...prev.service[svc],
          [key]: value
        }
      }
    }));
  };

  return (
    <div>
      <h3>Service Config</h3>

      {Object.keys(services).map(svc => {
        if (!services[svc] || !config[svc]) return null;

        return (
          <div key={svc} style={{ border: "1px solid gray", margin: 10, padding: 10 }}>
            <h4>{svc}</h4>

            {Object.entries(config[svc]).map(([k, v]) => {
              if (typeof v === "object") return null;

              return (
                <div key={k}>
                  {k}:
                  <input
                    value={v}
                    onChange={e => update(svc, k, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}