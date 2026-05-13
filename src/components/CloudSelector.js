export default function CloudSelector({ cloud, setCloud }) {
  return (
    <div>
      <h3>Cloud Provider</h3>
      <select value={cloud} onChange={e => setCloud(e.target.value)}>
        <option value="">Select</option>
        <option value="aws">AWS</option>
        <option value="gcp">GCP</option>
        <option value="azure">Azure</option>
      </select>
    </div>
  );
}
