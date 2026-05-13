import React, { useState, useEffect } from 'react';
import { getNodes, labelNode } from '../api/api';
import './NodeLabeling.css';

const NodeLabeling = () => {
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState('');
  const [labels, setLabels] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchNodes();
  }, []);

  const fetchNodes = async () => {
    try {
      const response = await getNodes();
      setNodes(response.data.nodes || []);
    } catch (error) {
      console.error('Failed to fetch nodes:', error);
      setMessage('Failed to fetch nodes');
    }
  };

  const handleLabelNode = async () => {
    if (!selectedNode || !labels.trim()) {
      setMessage('Please select a node and enter labels');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await labelNode(selectedNode, labels.trim());
      setMessage(response.data.message);
      
      // Refresh nodes to show updated labels
      await fetchNodes();
      
      // Clear form
      setLabels('');
      setSelectedNode('');
    } catch (error) {
      console.error('Failed to label node:', error);
      setMessage(error.response?.data?.error || 'Failed to label node');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="node-labeling">
      <h3>Node Labeling</h3>
      
      {message && (
        <div className={`message ${message.includes('success') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}

      <div className="node-list">
        <h4>Available Nodes</h4>
        <table>
          <thead>
            <tr>
              <th>Node Name</th>
              <th>Status</th>
              <th>Roles</th>
              <th>Current Labels</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, index) => (
              <tr key={index}>
                <td>
                  <input
                    type="radio"
                    name="nodeSelection"
                    value={node.name}
                    onChange={(e) => setSelectedNode(e.target.value)}
                    checked={selectedNode === node.name}
                  />
                  {node.name}
                </td>
                <td>{node.status}</td>
                <td>{node.roles}</td>
                <td className="labels-cell">
                  <code>{node.labels}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="label-form">
        <h4>Add Labels to Node</h4>
        <div className="form-group">
          <label htmlFor="nodeSelect">Selected Node:</label>
          <input
            type="text"
            id="nodeSelect"
            value={selectedNode}
            readOnly
            placeholder="Select a node from the list above"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="labelsInput">Labels (key=value format, space-separated):</label>
          <textarea
            id="labelsInput"
            value={labels}
            onChange={(e) => setLabels(e.target.value)}
            placeholder="environment=devops workload=database team=backend"
            rows={3}
          />
          <small>
            Example: environment=devops workload=database team=backend
          </small>
        </div>

        <button
          onClick={handleLabelNode}
          disabled={loading || !selectedNode || !labels.trim()}
          className="label-button"
        >
          {loading ? 'Adding Labels...' : 'Add Labels'}
        </button>
      </div>
    </div>
  );
};

export default NodeLabeling;
