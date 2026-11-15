# Multiplayer Release Gate / Manual QA Checklist

1. Two Chrome/Safari sessions on different devices connect to the *same networked Node server* and see each other in their room.
2. The same role/team seat cannot be occupied twice; the 17th player is rejected. The host alone can start, with opposing teams represented.
3. Movement is visible in both clients, remains server bounded, and a fake position, timer, score, or replayed movement packet cannot alter server truth.
4. All four build stations accept three verified interactions each. Empty roles do not prevent cooperative construction by other specialists.
5. All five timed phases complete; a browser losing focus stops that player's movement without pausing the match.
6. Planet B contains precisely twelve contested recoverable samples; a knocked-out carrier drops the held sample where they fell.
7. Stowing is not scoring. Delivering each onboard sample to the return beacon raises the team score by one.
8. Combat applies only to rival teams, with server-controlled range, directional aim, cooldown, cover and respawn.
9. Reconnect within 60 seconds gets the same player seat with current server state; expired reservations release the seat.
10. Test empty rooms, bad invite codes, malformed JSON, slow clients, interrupted WebSockets, mobile breakpoints, gamepad absence, Safari pointer-lock fallback, 100–200ms latency and multiple concurrent rooms.
11. Publish a persistent Node service with TLS and confirm `wss://` connectivity from a separately hosted HTTPS static frontend (set ALLOWED_ORIGINS exactly).
12. Do not market the online vertical slice as a fully replicated version of all offline construction and orbital mechanics.
