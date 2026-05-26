import streamDeck, { ApplicationDidLaunchEvent, ApplicationDidTerminateEvent } from "@elgato/streamdeck";

import { IncrementCounter } from "./actions/increment-counter";
import { PomotroidTimer } from "./actions/pomotroid-timer";


class PluginInfo {

    public static isPomotroidRunning?: boolean;

}


// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel("trace");


streamDeck.system.onApplicationDidLaunch((ev: ApplicationDidLaunchEvent) => {
    if(ev.application != "pomotroid.exe") return;
    PluginInfo.isPomotroidRunning = true;            
});

streamDeck.system.onApplicationDidTerminate((ev: ApplicationDidTerminateEvent) => {
    if(ev.application != "pomotroid.exe") return;
    PluginInfo.isPomotroidRunning = false;
});
        

// Register the increment action.
streamDeck.actions.registerAction(new IncrementCounter());
streamDeck.actions.registerAction(new PomotroidTimer());

// Finally, connect to the Stream Deck.
streamDeck.connect();
