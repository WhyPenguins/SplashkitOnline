// Handles SplashKit Online analytics
// The intention here is to gather usage data that
// can help us develop SKO further/use it in more effective
// ways, but in a privacy respecting way.

// Each time SKO starts, we generate a new unique ID which
// is used to connect events within the session. It _cannot_
// be used to connect users _between_ sessions, significantly
// limiting the ability to de-anonymize. We also ensure
// the events we send have extremely limited data, _just_
// enough to compute the metrics we're interested in.

// These ideas should guide any future development of this as well.
// Let's respect everyone's privacy, even in relatively unimportant
// tools such as this :)

// Just trying to decrease searchability, not intended to be secure - obscurity can still be better than nothing!
const endpointBase = `https://${atob('c3BsYXNoa2l0LW9ubGluZS1hbmFseXRpY3Muc2ltcGxlZmVlZGJhY2s=')}.workers.dev/api`;
let forceLogging = false; // disables endpoint logging filtering, should be false in production.

class SimpleAnalytics {
    constructor(activityID, _endpointBase = endpointBase, forceLog = forceLogging) {
        try{
            this.sessionID = crypto.randomUUID();
            this.endpointBase = _endpointBase;
            this.activityID = activityID;
            this.forceLog = forceLog;
            this.initialized = false;
        } catch (err) {
            // Fail silently - analytics shouldn't break the app :)
            console.warn("Analytics failed:", err);
        }
    }

    async post(endpoint_type, message) {
        const url = `${this.endpointBase}/${endpoint_type}`;

        if (this.forceLog)
            message.forceLog = true;

        try {
            // 'keepalive: true' allows the request to survive page navigation/close
            // we don't care about the response, so 'no-cors'
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message),
                keepalive: true,
                mode: 'no-cors'
            });
        } catch (err) {
            console.warn("Analytics failed:", err);
        }
    }

    initSession(event_data = {}) {
        try {
            event_data.embed = window.self !== window.top;
            event_data.embedMode = SKO.useEmbeddedInterface;

            this.post("initialize_sko_session", {
                session_id: this.sessionID,
                activity_id: this.activityID,
                event_data: event_data
            });

            this.initialized = true;

            window.addEventListener('pagehide', () => {
                this.endSession();
            });
        } catch (err) {
            console.warn("Analytics failed:", err);
        }
    }

    sendEvent(eventType, eventData = {}) {
        if (!this.initialized)
            this.initSession({type: "NA"});

        try {
            this.post("add_sko_event", {
                session_id: this.sessionID,
                event_type: eventType,
                event_data: eventData
            });
        } catch (err) {
            console.warn("Analytics failed:", err);
        }
    }

    // Helper for the leaving event
    endSession(eventData = {}) {
        try {
            this.post("end_sko_session", {
                session_id: this.sessionID,
                event_data: eventData
            });
        } catch (err) {
            console.warn("Analytics failed:", err);
        }
    }
}



// Util for computing string distance

// Does this belong here?
// Not really, but every
// file's a request.

// So here it stays :)

// Source - https://stackoverflow.com/a/35279162
// Posted by gustf, modified by community. See post 'Timeline' for change history
// Retrieved 2026-02-28, License - CC BY-SA 3.0

function levenshtein(s, t) {
    if (s === t) {
        return 0;
    }
    var n = s.length, m = t.length;
    if (n === 0 || m === 0) {
        return n + m;
    }
    var x = 0, y, a, b, c, d, g, h, k;
    var p = new Array(n);
    for (y = 0; y < n;) {
        p[y] = ++y;
    }

    for (; (x + 3) < m; x += 4) {
        var e1 = t.charCodeAt(x);
        var e2 = t.charCodeAt(x + 1);
        var e3 = t.charCodeAt(x + 2);
        var e4 = t.charCodeAt(x + 3);
        c = x;
        b = x + 1;
        d = x + 2;
        g = x + 3;
        h = x + 4;
        for (y = 0; y < n; y++) {
            k = s.charCodeAt(y);
            a = p[y];
            if (a < c || b < c) {
                c = (a > b ? b + 1 : a + 1);
            }
            else {
                if (e1 !== k) {
                    c++;
                }
            }

            if (c < b || d < b) {
                b = (c > d ? d + 1 : c + 1);
            }
            else {
                if (e2 !== k) {
                    b++;
                }
            }

            if (b < d || g < d) {
                d = (b > g ? g + 1 : b + 1);
            }
            else {
                if (e3 !== k) {
                    d++;
                }
            }

            if (d < g || h < g) {
                g = (d > h ? h + 1 : d + 1);
            }
            else {
                if (e4 !== k) {
                    g++;
                }
            }
            p[y] = h = g;
            g = d;
            d = b;
            b = c;
            c = a;
        }
    }

    for (; x < m;) {
        var e = t.charCodeAt(x);
        c = x;
        d = ++x;
        for (y = 0; y < n; y++) {
            a = p[y];
            if (a < c || d < c) {
                d = (a > d ? d + 1 : a + 1);
            }
            else {
                if (e !== s.charCodeAt(y)) {
                    d = c + 1;
                }
                else {
                    d = c;
                }
            }
            p[y] = d;
            c = a;
        }
        h = d;
    }

    return h;
}

