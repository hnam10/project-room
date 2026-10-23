import { WebSocket } from 'ws';
import type { ClientRtc, ServerRtc } from '@project-room/shared';
import { getMeeting } from '../repositories/meetings.js';

const KINDS = ['offer', 'answer', 'ice'];

/**
 * Forwards a WebRTC signal to one participant of a live meeting. Signals are never stored or logged.
 * Returns true only when the meeting is live in this project and both sides are in the call.
 */
export async function relayRtc(input: {
  projectId: string;
  from: string;
  msg: ClientRtc;
  socketsFor: (memberId: string) => Iterable<WebSocket>;
}): Promise<boolean> {
  const { projectId, from, msg, socketsFor } = input;
  if (typeof msg.meetingId !== 'string' || typeof msg.to !== 'string' || !KINDS.includes(msg.signal?.kind)) return false;
  const meeting = await getMeeting(projectId, msg.meetingId).catch(() => null);
  if (meeting?.status !== 'live' || !meeting.participantIds.includes(from) || !meeting.participantIds.includes(msg.to)) {
    return false;
  }
  const out: ServerRtc = { type: 'rtc', meetingId: msg.meetingId, from, signal: msg.signal };
  for (const socket of socketsFor(msg.to)) if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(out));
  return true;
}
