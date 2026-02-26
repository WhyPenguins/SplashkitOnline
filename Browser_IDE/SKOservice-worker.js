// Service worker that provides a communication channel between
// the user's code and the main page.
// File must be located at or above where the Execution Environment's page is.
importScripts('./fallibleMessage.js');

// event queue
const maxProgramEvents = 100;
let programEvents = [];

// queue events when supplied
self.addEventListener("message", (event) => {
    // these can't really fail, so avoid overhead of try catch and just resolve - still useful for timing purposes

    if (event.data.type == "programEvent")
        programEvents.push([event.data.command, event.data.args]);

    if (event.data.type == "clearEvents")
        programEvents = [];

    if (programEvents.length > maxProgramEvents)
        programEvents.splice(0, maxProgramEvents - programEvents.length);

    resolveMessageFallibleManual(event, undefined, event.source);
});

// when /programEvents.js is accessed, return all the events
// in the queue, and clear it.
// /sleep?ms=<milliseconds> allows for a non spin-loop delay
self.addEventListener("fetch", (event) => {
    const requestUrl = new URL(event.request.url);

    if (requestUrl.pathname === "/programEvents.js") {
        let currentEvents = programEvents;
        programEvents = [];
        event.respondWith(constructResponse(currentEvents));
    }
    else if (requestUrl.pathname === "/sleep") {
        let sleepLength = Number(requestUrl.searchParams.get("ms"));
        // Protect against sleeping too long by accident
        sleepLength = Math.min(sleepLength, 1000);

        event.respondWith((async function (){
                await new Promise(r => setTimeout(r, sleepLength));
                return constructResponse([]);
            })()
        );
    }
});

function constructResponse(programEvents) {
    return new Response(
        JSON.stringify(programEvents), {
            status: 200,
            statusText: "OK",
            headers: {
                "Content-Type": "text/javascript",
            }
        });
}

// attempts to make the service worker start quickly - don't seem to work in Firefox at least
self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});
