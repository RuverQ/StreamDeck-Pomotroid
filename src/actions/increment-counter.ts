import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";

/**
 * An example action class that displays a count that increments by one each time the button is pressed.
 */
@action({ UUID: "com.ruverq.pomotroid.increment" })
export class IncrementCounter extends SingletonAction<CounterSettings> {


	override onWillAppear(ev: WillAppearEvent<CounterSettings>): void | Promise<void> {


		
		return ev.action.setTitle(`${ev.payload.settings.count ?? 0}`);
	}


	override async onKeyDown(ev: KeyDownEvent<CounterSettings>): Promise<void> {

		const { settings } = ev.payload;
		settings.incrementBy ??= 1;
		
		settings.count ??= 2;
		settings.count ? 0 : settings.count = 1;
		settings.count *= 2;
		if(settings.count > 22)
			settings.count = 0;

		await ev.action.setSettings(settings);
		await ev.action.setTitle(`${settings.count}`);
	}
}


type CounterSettings = {
	count?: number;
	incrementBy?: number;
};
