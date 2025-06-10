// src/components/ConfirmationModal.jsx
import React from 'react';
import './ConfirmationModal.css'; // Criaremos este CSS

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirmar", cancelText = "Cancelar" }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">{title}</h3>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button onClick={onClose} className="button-cancel">
            {cancelText}
          </button>
          <button onClick={onConfirm} className="button-danger"> {/* Usando button-danger para destaque */}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
