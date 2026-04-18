const DEFAULT_POSAPP_BASE_PATH = "/app/posapp";

function trimTrailingSlash(path: string): string {
	if (!path) {
		return path;
	}

	if (path.length <= 1) {
		return path;
	}

	return path.replace(/\/+$/, "") || "/";
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolvePosAppPathMatch(pathname: string, basePath: string) {
	if (!pathname || !basePath) {
		return null;
	}

	const normalizedBasePath = trimTrailingSlash(basePath);
	const matcher = new RegExp(
		`^${escapeRegex(normalizedBasePath)}(?:(/.*))?$`,
		"i",
	);
	const match = pathname.match(matcher);
	if (!match) {
		return null;
	}

	return {
		normalizedBasePath,
		suffix: match[1] || "",
	};
}

export function resolvePosAppNormalizedPath(
	pathname: string,
	basePath = DEFAULT_POSAPP_BASE_PATH,
): string | null {
	const match = resolvePosAppPathMatch(pathname, basePath);
	if (!match) {
		return null;
	}

	const normalizedSuffix =
		match.suffix === "/" ? "" : trimTrailingSlash(match.suffix);
	const normalizedPath = normalizedSuffix
		? `${match.normalizedBasePath}${normalizedSuffix}`
		: match.normalizedBasePath;

	if (normalizedPath === pathname) {
		return null;
	}

	return normalizedPath;
}

export function resolvePosAppRouteFullPath(
	locationLike: { pathname?: string; search?: string; hash?: string } | null | undefined,
	basePath = DEFAULT_POSAPP_BASE_PATH,
): string | null {
	const pathname = locationLike?.pathname || "";
	const match = resolvePosAppPathMatch(pathname, basePath);
	if (!match) {
		return null;
	}

	const suffix = match.suffix === "/" ? "" : trimTrailingSlash(match.suffix);
	const routePath = suffix || "/";
	return `${routePath}${locationLike?.search || ""}${locationLike?.hash || ""}`;
}

export function buildPosAppRecoveryLocation(
	locationLike: { pathname?: string; search?: string; hash?: string } | null | undefined,
	param: string,
	token: string | number = Date.now(),
	basePath = DEFAULT_POSAPP_BASE_PATH,
): string {
	const normalizedPath =
		resolvePosAppNormalizedPath(locationLike?.pathname || "", basePath) ||
		locationLike?.pathname ||
		trimTrailingSlash(basePath);
	const searchParams = new URLSearchParams(locationLike?.search || "");
	searchParams.set(param, String(token));
	const query = searchParams.toString();
	return `${normalizedPath}${query ? `?${query}` : ""}${locationLike?.hash || ""}`;
}
