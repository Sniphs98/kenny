import '$lib/locale-choice';
import { m } from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime.js';

export const intlLocale = () => (getLocale() === 'de' ? 'de-DE' : 'en-GB');

// Public contracts keep their stable validation messages; localization belongs to presentation.
const errorTranslations = [
	{ pattern: /^Konto gesperrt oder nicht verfügbar\.$/, translate: () => m.um_error_account() },
	{ pattern: /^Administratorrechte erforderlich\.$/, translate: () => m.um_error_admin() },
	{ pattern: /^Projekt nicht gefunden oder kein Zugriff\.$/, translate: () => m.um_error_project() },
	{ pattern: /^Unzureichende Projektberechtigungen\.$/, translate: () => m.um_error_permissions() },
	{ pattern: /^Benutzer nicht gefunden\.$/, translate: () => m.um_error_user() },
	{
		pattern: /^Der letzte aktive Administrator kann nicht entfernt werden\.$/,
		translate: () => m.um_error_last_admin()
	},
	{ pattern: /^Benutzer ist bereits Projektmitglied\.$/, translate: () => m.um_error_existing_member() },
	{ pattern: /^Projektmitglied nicht gefunden\.$/, translate: () => m.um_error_member() },
	{
		pattern: /^Der letzte Projektadministrator kann nicht entfernt werden\.$/,
		translate: () => m.um_error_last_project_admin()
	},
	{ pattern: /^Zuständige müssen aktive Projektmitglieder sein\.$/, translate: () => m.um_error_assignee() },
	{
		pattern: new RegExp('^Bitte eine Farbe wie #6366f1 angeben\\.$'),
		translate: (_values: string[]) => m.enter_a_color_such_as_6366f1()
	},
	{
		pattern: new RegExp('^Bitte ein gültiges Datum im Format YYYY-MM-DD angeben\\.$'),
		translate: (_values: string[]) => m.enter_a_valid_date_in_yyyy_mm_dd_format()
	},
	{ pattern: new RegExp('^Bitte einen Namen angeben\\.$'), translate: (_values: string[]) => m.enter_a_name() },
	{
		pattern: new RegExp('^Kürzel: 2–10 Buchstaben/Ziffern, beginnt mit Buchstabe\\.$'),
		translate: (_values: string[]) => m.key_2_10_letters_or_digits_starting_with_a_letter()
	},
	{ pattern: new RegExp('^Bitte einen Titel angeben\\.$'), translate: (_values: string[]) => m.enter_a_title() },
	{
		pattern: new RegExp('^Startdatum liegt nach dem Fälligkeitsdatum\\.$'),
		translate: (_values: string[]) => m.start_date_is_after_the_due_date()
	},
	{ pattern: new RegExp('^Zielticket fehlt\\.$'), translate: (_values: string[]) => m.target_ticket_is_missing() },
	{
		pattern: new RegExp('^Keine Datei übergeben \\(Feld "file", multipart/form-data\\)\\.$'),
		translate: (_values: string[]) => m.no_file_supplied_field_file_multipart_form_data()
	},
	{
		pattern: new RegExp('^"(.+?)" ist größer als (.+?) MB\\.$'),
		translate: (values: string[]) => m.exceeds_mb({ value1: values[0], value2: values[1] })
	},
	{ pattern: new RegExp('^Anhang nicht gefunden\\.$'), translate: (_values: string[]) => m.attachment_not_found() },
	{
		pattern: new RegExp('^Datei fehlt auf dem Server\\.$'),
		translate: (_values: string[]) => m.file_is_missing_on_the_server()
	},
	{
		pattern: new RegExp('^Projekt "(.+?)" nicht gefunden\\.$'),
		translate: (values: string[]) => m.project_not_found({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Kürzel muss 2–10 Zeichen lang sein \\(Buchstaben/Ziffern, beginnt mit Buchstabe\\)\\.$'),
		translate: (_values: string[]) => m.key_must_be_2_10_letters_or_digits_starting_with_a_letter()
	},
	{
		pattern: new RegExp('^Kürzel "(.+?)" ist bereits vergeben\\.$'),
		translate: (values: string[]) => m.key_is_already_taken({ value1: values[0] })
	},
	{ pattern: new RegExp('^Spalte nicht gefunden\\.$'), translate: (_values: string[]) => m.column_not_found() },
	{
		pattern: new RegExp('^Die letzte Spalte kann nicht gelöscht werden\\.$'),
		translate: (_values: string[]) => m.cannot_delete_the_last_column()
	},
	{
		pattern: new RegExp('^Die Spalte enthält noch Tickets\\. Bitte zuerst verschieben\\.$'),
		translate: (_values: string[]) => m.the_column_still_contains_tickets_move_them_first()
	},
	{
		pattern: new RegExp('^Feld "color" muss eine Farbe wie #3b82f6 sein\\.$'),
		translate: (_values: string[]) => m.field_color_must_be_a_color_such_as_3b82f6()
	},
	{ pattern: new RegExp('^Tag nicht gefunden\\.$'), translate: (_values: string[]) => m.tag_not_found() },
	{
		pattern: new RegExp('^Tag "(.+?)" gibt es bereits\\.$'),
		translate: (values: string[]) => m.tag_already_exists({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Feld "tags" muss eine Liste sein\\.$'),
		translate: (_values: string[]) => m.field_tags_must_be_a_list()
	},
	{
		pattern: new RegExp('^Tag (.+?) gibt es in diesem Projekt nicht\\.$'),
		translate: (values: string[]) => m.tag_does_not_exist_in_this_project({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Ticket "(.+?)" nicht gefunden\\.$'),
		translate: (values: string[]) => m.ticket_not_found({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Spalte "(.+?)" gibt es in diesem Projekt nicht\\.$'),
		translate: (values: string[]) => m.column_does_not_exist_in_this_project({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Unteraufgaben müssen im selben Projekt liegen wie das übergeordnete Ticket\\.$'),
		translate: (_values: string[]) => m.subtasks_must_belong_to_the_same_project_as_their_parent_ticket()
	},
	{
		pattern: new RegExp('^Ein Ticket kann nicht Unteraufgabe von sich selbst sein\\.$'),
		translate: (_values: string[]) => m.a_ticket_cannot_be_its_own_subtask()
	},
	{
		pattern: new RegExp('^Benutzer "(.+?)" nicht gefunden\\.$'),
		translate: (values: string[]) => m.user_not_found({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Projekt hat keine Spalten\\.$'),
		translate: (_values: string[]) => m.project_has_no_columns()
	},
	{
		pattern: new RegExp('^Feld "dependsOn" muss eine Liste sein\\.$'),
		translate: (_values: string[]) => m.field_dependson_must_be_a_list()
	},
	{
		pattern: new RegExp('^Feld "relatesTo" muss eine Liste sein\\.$'),
		translate: (_values: string[]) => m.field_relatesto_must_be_a_list()
	},
	{
		pattern: new RegExp('^Das Projekt hat keine Spalte, die als "erledigt" markiert ist\\.$'),
		translate: (_values: string[]) => m.the_project_has_no_column_marked_as_done()
	},
	{
		pattern: new RegExp('^Das Projekt hat keine offene Spalte\\.$'),
		translate: (_values: string[]) => m.the_project_has_no_open_column()
	},
	{
		pattern: new RegExp('^Ein Ticket kann nicht mit sich selbst verknüpft werden\\.$'),
		translate: (_values: string[]) => m.a_ticket_cannot_be_linked_to_itself()
	},
	{
		pattern: new RegExp('^Diese Abhängigkeit würde einen Zyklus erzeugen\\.$'),
		translate: (_values: string[]) => m.this_dependency_would_create_a_cycle()
	},
	{ pattern: new RegExp('^Verknüpfung nicht gefunden\\.$'), translate: (_values: string[]) => m.link_not_found() },
	{
		pattern: new RegExp('^Feld "(.+?)" ist erforderlich\\.$'),
		translate: (values: string[]) => m.field_is_required({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Feld "(.+?)" ist zu lang \\(max\\. (.+?)\\)\\.$'),
		translate: (values: string[]) => m.field_is_too_long_max({ value1: values[0], value2: values[1] })
	},
	{
		pattern: new RegExp('^Feld "(.+?)" muss ein Text sein\\.$'),
		translate: (values: string[]) => m.field_must_be_text({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Feld "(.+?)" muss ein Datum im Format YYYY-MM-DD sein\\.$'),
		translate: (values: string[]) => m.field_must_be_a_date_in_yyyy_mm_dd_format({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Feld "(.+?)" muss eine ganze Zahl sein\\.$'),
		translate: (values: string[]) => m.field_must_be_an_integer({ value1: values[0] })
	},
	{
		pattern: new RegExp('^Feld "(.+?)" muss einer von (.+?) sein\\.$'),
		translate: (values: string[]) => m.field_must_be_one_of({ value1: values[0], value2: values[1] })
	},
	{
		pattern: new RegExp('^Nicht angemeldet\\. Bitte API-Token als Bearer-Token senden\\.$'),
		translate: (_values: string[]) => m.not_signed_in_send_an_api_token_as_a_bearer_token()
	},
	{ pattern: new RegExp('^Ungültiges API-Token\\.$'), translate: (_values: string[]) => m.invalid_api_token() },
	{
		pattern: new RegExp('^Benutzer zum Token existiert nicht mehr\\.$'),
		translate: (_values: string[]) => m.the_token_s_user_no_longer_exists()
	},
	{ pattern: new RegExp('^Interner Fehler$'), translate: (_values: string[]) => m.internal_error() },
	{
		pattern: new RegExp('^Request-Body muss ein JSON-Objekt sein\\.$'),
		translate: (_values: string[]) => m.request_body_must_be_a_json_object()
	},
	{
		pattern: new RegExp('^Ungültiges multipart/form-data\\.$'),
		translate: (_values: string[]) => m.invalid_multipart_form_data()
	},
	{
		pattern: new RegExp(
			'^Entweder multipart/form-data mit Feld "file" oder \\?filename=… mit der Datei als Body senden\\.$'
		),
		translate: (_values: string[]) => m.send_multipart_or_filename()
	},
	{ pattern: new RegExp('^Formular nicht gefunden\\.$'), translate: (_values: string[]) => m.form_not_found() },
	{
		pattern: new RegExp('^Ein ausgewähltes Projekt gibt es nicht\\.$'),
		translate: (_values: string[]) => m.selected_project_does_not_exist()
	},
	{
		pattern: new RegExp('^Zu viele Einreichungen\\. Bitte später erneut versuchen\\.$'),
		translate: (_values: string[]) => m.too_many_submissions()
	},
	{
		pattern: new RegExp('^Für dieses Formular ist eine Anmeldung nötig\\.$'),
		translate: (_values: string[]) => m.form_requires_login()
	},
	{ pattern: new RegExp('^Bitte ein Projekt auswählen\\.$'), translate: (_values: string[]) => m.choose_a_project() },
	{
		pattern: new RegExp('^Bitte eine E-Mail-Adresse angeben\\.$'),
		translate: (_values: string[]) => m.enter_an_email()
	},
	{
		pattern: new RegExp('^Bitte mindestens ein Projekt auswählen\\.$'),
		translate: (_values: string[]) => m.choose_at_least_one_project()
	},
	{
		pattern: new RegExp('^Bitte eine gültige E-Mail-Adresse angeben\\.$'),
		translate: (_values: string[]) => m.enter_a_valid_email()
	},
	{
		pattern: new RegExp('^Bitte eine Beschreibung angeben\\.$'),
		translate: (_values: string[]) => m.enter_a_description()
	},
	{ pattern: new RegExp('^Bitte eine Priorität wählen\\.$'), translate: (_values: string[]) => m.choose_a_priority() },
	{
		pattern: new RegExp('^Bitte ein Startdatum angeben\\.$'),
		translate: (_values: string[]) => m.enter_a_start_date()
	},
	{
		pattern: new RegExp('^Bitte ein Fälligkeitsdatum angeben\\.$'),
		translate: (_values: string[]) => m.enter_a_due_date()
	},
	{
		pattern: new RegExp('^Bitte mindestens einen Tag wählen\\.$'),
		translate: (_values: string[]) => m.choose_at_least_one_tag()
	},
	{
		pattern: new RegExp('^Bitte mindestens eine Datei anhängen\\.$'),
		translate: (_values: string[]) => m.attach_at_least_one_file()
	},
	{
		pattern: new RegExp('^Höchstens (.+?) Dateien\\.$'),
		translate: (values: string[]) => m.at_most_files({ count: values[0] })
	},
	{
		pattern: /^Tag (.+?) ist in diesem Formular nicht erlaubt\.$/,
		translate: (values: string[]) => m.tag_not_allowed({ name: values[0] })
	},
	{
		pattern: /^Ein ausgewählter Tag gehört zu keinem Projekt des Formulars\.$/,
		translate: () => m.tag_not_in_form_projects()
	},
	{ pattern: /^Microsoft Teams ist nicht aktiviert\.$/, translate: () => m.teams_not_enabled() }
];

export function localizeError(message: string | undefined): string {
	if (!message || getLocale() === 'de') return message ?? '';
	for (const rule of errorTranslations) {
		const match = message.match(rule.pattern);
		if (match) return rule.translate(match.slice(1));
	}
	// Zod adds a field prefix and can return multiple validation issues.
	if (message.includes('; ')) return message.split('; ').map(localizeError).join('; ');
	const field = message.match(/^([^:]+): (.+)$/);
	if (field) return field[1] + ': ' + localizeError(field[2]);
	return message;
}
