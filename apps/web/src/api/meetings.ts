import type { Meeting, MeetingCreateInput, MeetingDetail, Poll, TranscriptLine } from '@project-room/shared';
import { p, request } from './client';

const m = (projectId: string) => `${p(projectId)}/meetings`;

export const meetingsApi = {
  list: (projectId: string) => request<Meeting[]>('GET', m(projectId)),
  get: (projectId: string, id: string) => request<MeetingDetail>('GET', `${m(projectId)}/${id}`),
  start: (projectId: string, input: MeetingCreateInput) => request<Meeting>('POST', m(projectId), input),
  join: (projectId: string, id: string) => request<Meeting>('POST', `${m(projectId)}/${id}/join`),
  leave: (projectId: string, id: string) => request<Meeting>('POST', `${m(projectId)}/${id}/leave`, undefined, { keepalive: true }),
  postLine: (projectId: string, id: string, text: string) => request<TranscriptLine>('POST', `${m(projectId)}/${id}/lines`, { text }),
  end: (projectId: string, id: string) => request<Meeting>('POST', `${m(projectId)}/${id}/end`),
  setAi: (projectId: string, id: string, enabled: boolean) => request<Meeting>('POST', `${m(projectId)}/${id}/ai`, { enabled }),
  vote: (projectId: string, pollId: string, optionId: string) =>
    request<Poll>('POST', `${p(projectId)}/polls/${pollId}/vote`, { optionId }),
  closePoll: (projectId: string, pollId: string) => request<Poll>('POST', `${p(projectId)}/polls/${pollId}/close`),
  rtcConfig: (projectId: string) => request<{ iceServers: unknown[] }>('GET', `${m(projectId)}/rtc-config`),
};
