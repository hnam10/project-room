# Meeting audio connectivity

Voice and transcription share each member's microphone but use independent delivery paths. Peer
connection recovery does not stop microphone recording. The Audio check/debug panel has been removed.

## Connection lifecycle

Clients announce a fresh join session through the project-authorized WebSocket relay. The lower member
id offers each pair a connection after both clients announce readiness, avoiding simultaneous offers.
All offers, answers and ICE candidates are tagged with both join sessions and the connection id. A
rejoin replaces both endpoints even if other clients missed the leave event. Retired signals are ignored.
Failed/disconnected pairs are rebuilt with bounded retries, preserving healthy pairs and mic tracks.
A receiver can request a rebuild even if the other endpoint still thinks the pair is connected.

Refresh all clients after deployment: older clients do not understand the readiness/session protocol.
Enable audio handles browser autoplay restrictions. Reconnect audio retries failed pairs. Microphone and
transcription errors remain visible, without diagnostic controls in the normal meeting interface.

## Transcription

Every unmuted member records their own six-second clips in a browser-supported audio format. Uploads
are serialized with a bounded queue, and successful API results appear in local state immediately.
No client AudioContext or volume threshold gates uploads; the speech service filters silence. This
avoids dropping quiet microphones or clips from browsers with paused audio analysis. This also means
silent clips consume speech-service quota. Muting/leaving stops recording and queued uploads.

Configuration requests retry before showing an error; failure never silently switches transcription
providers or removes the relay configuration. Delayed meeting fetches preserve newer joins, leaves
and transcript lines rather than tearing down a call based on an older snapshot.

## Relay configuration

The default RTC_ICE_SERVERS contains only Google STUN. For calls across restrictive networks, configure
an authenticated TURN service on the API deployment. The protected /meetings/rtc-config endpoint supplies
its configuration to participants. The value must be a JSON array, not a JavaScript example:

```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  {
    "urls": ["turn:relay.example.com:3478?transport=udp", "turns:relay.example.com:443?transport=tcp"],
    "username": "provider-issued-username",
    "credential": "provider-issued-credential"
  }
]
```

Use provider-supported hosts/transports. Keep service API secrets server-side; use provider-issued
client credentials here and prefer short-lived credentials for production. Restart/redeploy after
changing configuration, then refresh and rejoin. On 2026-10-29 Render's pasted JavaScript value was
corrected to the provider's JSON ICE array and redeployed. An earlier STUN fallback warning describes
the prior deployment, not the corrected one. No credentials are committed to this repository.

Reference: [WebRTC TURN guidance](https://webrtc.org/getting-started/turn-server).

## Verification

The rebuilt transport was checked with native browser WebRTC and synthetic sound through the configured
TURN relay: all six directions in a three-peer mesh received sound, including after rejoin without an
intervening membership update. These local checks do not prove physical device input/output or every
cross-network path. Temporary verification pages are removed after use.

Test two browsers/devices on different networks, then three. Check every direction, second/third member
leave/rejoin, delayed microphone permission, simultaneous joins, mute/unmute and network interruptions.
Confirm each person's transcript appears for everyone. Verify real relay use through the selected
candidate pair if a restrictive network fails; do not share raw IP addresses, SDP or credentials.
