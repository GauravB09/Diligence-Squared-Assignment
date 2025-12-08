import React from 'react';
import { Widget } from '@typeform/embed-react';

/**
 * Survey component that embeds a TypeForm survey
 * @param {string} formId - The TypeForm form ID
 * @param {string} userId - The user ID to pass as a hidden field
 * @param {object} style - Optional custom styles for the widget container
 * @param {function} onSubmit - Optional callback function when form is submitted
 */
const Survey = ({
  formId,
  userId,
  style = { width: '100%', height: '600px' },
  onSubmit
}) => {
  // Validate required props
  if (!formId) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        Error: TypeForm ID is required
      </div>
    );
  }

  if (!userId) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        Error: User ID is required
      </div>
    );
  }

  const handleTypeformSubmit = (event) => {
    console.log("🔥 TYPEFORM WIDGET FIRED ONSUBMIT EVENT 🔥", event);
    if (onSubmit) {
        onSubmit(event);
    }
  };

  return (
    <div style={{ width: '100%', margin: '0 auto' }}>
      <Widget
        id={formId}
        style={style}
        hidden={{ user_id: userId }}
        onSubmit={handleTypeformSubmit}
      />
    </div>
  );
};

export default Survey;

