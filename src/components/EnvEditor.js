
export default function EnvEditor({ envList, setEnvList }) {

  const addEnv = () => {
    setEnvList([...envList, { name: "", value: "" }]);
  };

  const updateEnv = (index, field, value) => {
    const updated = [...envList];
    updated[index][field] = value;
    setEnvList(updated);
  };

  const removeEnv = (index) => {
    const updated = envList.filter((_, i) => i !== index);
    setEnvList(updated);
  };

  return (
    <div>
      <h3>Environment Variables</h3>

      {envList.map((env, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <input
            placeholder="KEY"
            value={env.name}
            onChange={(e) => updateEnv(i, "name", e.target.value)}
          />
          <input
            placeholder="VALUE"
            value={env.value}
            onChange={(e) => updateEnv(i, "value", e.target.value)}
          />
          <button onClick={() => removeEnv(i)}>X</button>
        </div>
      ))}

      <button onClick={addEnv}>+ Add Env</button>
    </div>
  );
}