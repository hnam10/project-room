import { Modal } from '../../components/Modal';

/** Shown before starting or joining. Joining = accepting. */
export function ConsentDialog(props: { open: boolean; action: 'start' | 'join'; onClose: () => void; onAccept: () => void }) {
  return (
    <Modal
      open={props.open}
      title={props.action === 'start' ? 'Start the meeting' : 'Join the meeting'}
      eyebrow="Before you join"
      onClose={props.onClose}
      onSubmit={props.onAccept}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            I agree, {props.action === 'start' ? 'start' : 'join'}
          </button>
        </>
      }
    >
      <ul className="consent-list">
        <li>Your microphone is used while you are in the meeting.</li>
        <li>Your browser sends your audio to its speech service (Google, in Chrome) to turn it into text.</li>
        <li>The transcript is saved to this project and visible to its members.</li>
        <li>Claude reads the transcript.</li>
      </ul>
      <p className="modal-note">Joining means you accept this.</p>
    </Modal>
  );
}
