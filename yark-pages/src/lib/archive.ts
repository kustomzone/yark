/**
 * Connector to the official Yark REST API for interfacing
 */

import { goto } from '$app/navigation';
import { get } from 'svelte/store';
import { yarkStore } from './store';
import { elementWasUpdated, type Element } from './element';
import { getAdminSecret } from './utils';

/**
 * Core archive representation used by various components
 */
export interface Archive {
	/**
	 * The base server url this archive can be found at
	 */
	server: string;
	/**
	 * The unique slug identifier of this archive
	 */
	slug: string;
}

/**
 * Payload for creating a brand new {@link Archive} using a server
 */
export interface CreateArchiveRemotePayload {
	/**
	 * See {@link Archive.server}
	 */
	server: string;
	/**
	 * See {@link Archive.slug}
	 */
	slug: string;
	/**
	 * The full path (from drive/root) on the server to save the new archive to, including the final directory name
	 */
	path: string;
	/**
	 * The YouTube target URL which the archive is intended to capture
	 */
	target: string;
}

/**
 * Payload for importing an existing {@link Archive} into a server
 */
export interface ImportArchiveRemotePayload {
	/**
	 * See {@link Archive.server}
	 */
	server: string;
	/**
	 * See {@link Archive.slug}
	 */
	slug: string;
	/**
	 * The full path (from drive/root) on the server to the archive to import
	 */
	path: string;
}

/**
 * Creates a brand new archive on the server, provided that the credentials are correct
 * TODO: document auth once done
 * @param param0 Payload for creation
 * @returns Representation of the newly-created archive
 */
export async function createNewRemoteArchive({
	server,
	slug,
	path,
	target
}: CreateArchiveRemotePayload): Promise<Archive> {
	// TODO: auth
	const payload = { slug, path, target };
	const url = new URL(server);

	url.pathname = '/archive';
	url.searchParams.set('intent', 'create');

	return await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			"Authentication": `Bearer ${await getAdminSecret()}`
		},
		body: JSON.stringify(payload)
	})
		.then((resp) => resp.json())
		.then((resp_json) => {
			return { server, slug: resp_json.slug };
		});
}

/**
 * Imports an existing archive on the server, effectively making the server aware of this existing archive
 * TODO: document auth once done
 * @param param0 Payload for importing
 * @returns Representation of the newly-imported archive
 */
export async function importNewRemoteArchive({
	server,
	slug,
	path
}: ImportArchiveRemotePayload): Promise<Archive> {
	// TODO: auth
	const payload = { slug, path };
	const url = new URL(server);

	url.pathname = '/archive';
	url.searchParams.set('intent', 'existing');

	return await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			"Authentication": `Bearer ${await getAdminSecret()}`
		},
		body: JSON.stringify(payload)
	})
		.then((resp) => resp.json())
		.then((resp_json) => {
			return { server, slug: resp_json.slug };
		});
}

/**
 * Gets the currently-opened archive or throws an exception; intended solely for use when an archive is known to be opened
 * @returns The currently-opened archive
 */
export function getOpenedArchiveAlways(): Archive {
	const archive = get(yarkStore).openedArchive
	if (archive == undefined) { throw new Error("Archive was expected to be open but it wasn't") }
	return archive
}

/**
 * Generates a link to the currently opened archive inside of the store or raises an exception because there isn't any opened archive
 * 
 * This function is intended solely for use when an archive is known to be opened
 * @returns Link to the currently opened archive
 */
function getOpenedArchiveApiLink(): string {
	return getArchiveApiLink(getOpenedArchiveAlways())
}

/**
 * Generates a link to the archive route to link to; doesn't include `/videos` or anything else like that on the end
 * @param archive Archive to get link to
 * @returns HTTP link to the archive
 */
function getArchiveApiLink(archive: Archive): string {
	return `${archive.server}/archive/${archive.slug}`
}

/**
 * Gets the API link to the thumbnail; assumes that the video is part of the currently-opened archive
 * @param video Video to get link for
 * @returns API link to the thumbnail which will return as a file
 */
export function getVideoThumbnailApiLink(thumbnail_id: string): string {
	return `${getOpenedArchiveApiLink()}/thumbnail/${thumbnail_id}`
}

/**
 * Gets the API link to the raw video file which the archived video is actually referring to in the currently-opened archive
 * @param video Video to get link for
 * @returns API link to the raw video which will return as a file
 */
export function getVideoFileApiLink(videoId: string): string {
	return `${getOpenedArchiveApiLink()}/video/${videoId}/file`
}


/**
 * Sets an archive to be the currently-operable archive in the app-wide store
 * @param archive Archive to set as current
 */
export function setCurrentArchive(archive: Archive): void {
	const RECENTS_MAX = 30;
	yarkStore.update((value) => {
		value.openedArchive = archive;

		if (value.recents.length >= RECENTS_MAX) {
			value.recents.shift();
		}

		value.recents.push(archive);

		return value;
	});
	goto(`/archive/videos`);
}

/**
 * Fetches information on a whole list of videos (e.g., livestreams) in the currently-opened archive
 * @param kind Kind of videos to fetch
 * @returns Brief info about an entire list/category of videos on the archive
 */
export async function fetchVideosBrief(
	kind: ArchiveVideoKind
): Promise<VideoBrief[]> {
	const url = new URL(getOpenedArchiveApiLink())
	url.searchParams.set('kind', archiveVideoKindToString(kind));

	return await fetch(url).then((resp) => resp.json());
}

/**
 * Fetches information on a specific video inside of the currently-opened archive
 * @param id The identifier of the video to fetch
 * @returns Detailed video interface promise and the raw JSON response
 */
export async function fetchVideoDetails(id: string): Promise<[VideoDetailed, string]> {
	const url = new URL(getOpenedArchiveApiLink())
	url.pathname += `/video/${id}`

	return await fetch(url).then(async (resp) => {
		const rawArchive = await resp.text()
		const json = JSON.parse(rawArchive)
		return [json, rawArchive]
	})
}

/**
 * Video list kind which can be got from an archive
 */
export enum ArchiveVideoKind {
	Videos,
	Livestreams,
	Shorts
}

/**
 * Converts a {@link ArchiveVideoKind} to an API-compatible query string (e.g., `videos`)
 * @param kind Kind to convert to string
 * @returns Stringified API-compatible version
 */
export function archiveVideoKindToString(kind: ArchiveVideoKind): string {
	switch (kind) {
		case ArchiveVideoKind.Videos:
			return 'videos';
		case ArchiveVideoKind.Livestreams:
			return 'livestreams';
		case ArchiveVideoKind.Shorts:
			return 'shorts';
	}
}


/**
 * Short information on a video, intended to be displayed on a long list
 */
export interface VideoBrief {
	/**
	 * Video identifier to open to learn more about the video
	 */
	id: string;
	/**
	 * Current human-readable title of the video
	 */
	title: string;
	/**
	 * Date it was uploaded to display/sort using
	 */
	uploaded: Date;
	/**
	 * Current thumbnail identifier of the video to display
	 */
	thumbnail_id: string;
}

/**
 * Detailed information on a specific video to use in a video information page; this interface reflects essentially the raw archive format
 */
export interface VideoDetailed {
	/**
	 * Date video was uploaded in ISO time
	 */
	uploaded: string;
	/**
	 * Numeric width of video
	 */
	width: number;
	/**
	 * Numeric height of video
	 */
	height: number;
	/**
	 * Title history of the video
	 */
	title: Element;
	/**
	 * Description history of the video
	 */
	description: Element;
	/**
	 * View count history of the video
	 */
	views: Element;
	/**
	 * Like count history of the video
	 */
	likes: Element;
	/**
	 * Thumbnail history of the video using thumbnail identifiers
	 */
	thumbnail: Element;
	/**
	 * Deleted status history of the video
	 */
	deleted: Element;
	/**
	 * User-created notes on this video
	 */
	notes: Note[];
	/**
	 * Comment archive/history of the video
	 */
	comments: object // TODO: comments interface
}

/**
 * Checks if a video has been updated (most likely by the user except for glitches) by checking major elements
 * @param video Video to check
 * @returns If the video was updated or not
 */
export function videoWasUpdated(video: VideoDetailed): boolean {
	return elementWasUpdated(video.title) || elementWasUpdated(video.description) || elementWasUpdated(video.thumbnail)
}


/**
 * Note for a {@link VideoDetailed} with user-submitted information
 */
export interface Note {
	/**
	 * Unique UUID identifier of the note
	 */
	id: string,
	/**
	 * Timestamp of where the note is relevant to
	 */
	timestamp: number,
	/**
	 * Big title of the note, required
	 */
	title: string,
	/**
	 * Main optional paragraph description of the note
	 */
	body: string
}

/**
 * Deletes a note from a provided video if it exists
 * @param video_id Video identifier note is attached to
 * @param note Note object to delete
 */
export async function deleteNote(video_id: string, note: Note) {
	const url = new URL(getOpenedArchiveApiLink())
	url.pathname += `/video/${video_id}/note/${note.id}`

	await fetch(url, {
		method: "DELETE"
	})
}