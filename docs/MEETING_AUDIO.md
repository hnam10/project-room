# Meeting audio connectivity

The transcript and voice call use different paths. A working transcript confirms that speech capture
and HTTP requests work; it does not confirm that another participant can receive WebRTC audio.

The client buffers signaling during microphone/ICE setup, handles simultaneous offers, retries lost
offers and restarts failed ICE connections. Reconnect audio retries unsuccessful pairs without leaving
the meeting, stopping transcription or changing mute state. Enable audio handles browser autoplay blocks
and remains available in the floating call bar when the member visits another page.

## Different networks need a relay fallback

The default `RTC_ICE_SERVERS` configuration contains only Google STUN. STUN helps discover a direct
route, but it cannot relay audio when NAT/firewall restrictions prevent a direct connection. Some member
pairs can connect while others cannot. Muting does not supply a missing network route.

For production calls across networks, provision an authenticated TURN service and set `RTC_ICE_SERVERS`
on the **API deployment** to its ICE configuration. The existing project-authorized `/meetings/rtc-config`
endpoint supplies that configuration to meeting clients. Restart/redeploy the API after updating it;
members should leave/rejoin to fetch fresh configuration.

Example configuration only; replace the example host and credentials with those supplied by your service:

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

Use only URLs/transports supported by the provider. Keep credentials out of source control and logs;
prefer short-lived TURN credentials for production. A TURN service's API secret must never be handed
to browsers as a client credential. This change does not provision a relay or alter production settings.

Reference: [WebRTC TURN server guidance](https://webrtc.org/getting-started/turn-server).

## Verify the actual call

Test two browsers/devices on different networks, then add a third participant. Check that every member
hears every other member, including after a delayed microphone prompt, simultaneous joins, mute/unmute,
temporary connectivity loss and leaving/rejoining. Confirm the remaining pairs keep hearing each other
when one member leaves. Check Enable audio from the floating call bar if autoplay is blocked.

For relay verification, browser WebRTC diagnostics should show a selected candidate pair containing a
relay candidate on a network where direct connectivity fails. Do not publish raw diagnostics containing
IP addresses, SDP or credentials. Synthetic/fake-peer tests cover client behavior but cannot prove a
deployment's TURN credentials, firewall path or physical microphone/speaker behavior.
