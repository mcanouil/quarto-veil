#!/usr/bin/env bash
#
# Documentation Pre-render Script
# Generates the extension variables and the changelog page, and caches the
# social card.
#
# @license MIT License
# @copyright 2026 Mickaël Canouil
# @author Mickaël Canouil
#
# The generated files, changelog.qmd, _atelier-version.yml and, in an extension
# repository, _variables.yml, are ignored by Git and removed by post-render.sh.
#
# A repository that publishes a Quarto extension also has
# _scripts/sync-extension.sh beside this script. That copy cannot be made here:
# Quarto resolves extensions before any pre-render script runs, so the sync is
# a separate step, run before the render rather than during it.
#
# assets/social/og-image.png is ignored by Git as well, unless the scaffold
# committed a card there, and then nothing here touches it. Otherwise it is a
# cache rather than a transient, so post-render.sh leaves it in place. It is
# GitHub's own preview card for this repository, which the endpoint serves for
# public repositories only: for anything else it answers 200 with a generic
# Octocat placeholder rather than an error, so the card is checked as well as
# fetched. A local render and a pull request check both carry on without one;
# only the render that publishes refuses to. See assets/social/README.md.
#
# A repository that publishes a Quarto extension gets _variables.yml with an
# `extension` block, carrying the reference a reader installs, so the pages can
# write `quarto add {{< var extension.reference >}}`. The version comes from the
# extension manifest, which the release workflow bumps. Quarto re-reads the
# project configuration after pre-render, which is what makes a generated
# variables file work at all. Any other repository gets no variables file from
# this script.
#
# A site also gets _atelier-version.yml, which sets
# `extensions.atelier.version`, so atelier shows the released version beside
# the site title. The version comes from the extension manifest, or else from
# the `version:` line of CITATION.cff at the repository root. With neither, the
# script says so and writes no file.
# A `{{< var >}}` shortcode does not work there, because atelier reads the
# option as plain metadata. `_quarto.yml` loads the file through
# `metadata-files`, and Quarto merges it into the `extensions.atelier` block
# that `_quarto.yml` already sets.
#
# Version headings are restructured into a three-level hierarchy:
#
#   ## X.Y.Z (date)          (in CHANGELOG.md)
#
# becomes:
#
#   ## X {#version-X}
#   ### X.Y {#version-X-Y}
#   #### X.Y.Z (date) {#version-X-Y-Z}
#
# A version heading is promoted by two levels, so every heading nested under it
# shifts by the same two: "### New Features" becomes "##### New Features".
# Without the shift a subsection closes the version it belongs to, and the
# document outline stops matching the page.
#
# The "Unreleased" section is omitted, so the page describes released versions
# only.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "${SCRIPT_DIR}")"
ROOT_DIR="$(dirname "${DOCS_DIR}")"

# The extension the site documents, if it documents one, named by the directory
# that holds it, which is the name its shortcodes and filters are registered
# under. Deriving it keeps this script identical in every repository, and an
# empty value is what tells the rest of the script this is not an extension
# repository.
EXTENSION_NAME=""
for extension_dir in "${ROOT_DIR}"/_extensions/*/; do
	[[ -f "${extension_dir}_extension.yml" ]] || continue
	EXTENSION_NAME="$(basename "${extension_dir}")"
	break
done

# What the changelog page calls the thing it lists versions of: the extension
# where there is one, and otherwise the repository itself.
PROJECT_NAME="${EXTENSION_NAME:-$(basename "${ROOT_DIR}")}"

# The first plain, single-line `version:` value of a file; a block scalar is
# not read. Prints nothing when the file has no such line.
read_version() {
	sed -n -e '/^version:/{' \
		-e 's/^version:[[:space:]]*["'\'']\{0,1\}\([^"'\''[:space:]]*\).*/\1/p' \
		-e q -e '}' "$1"
}

# The version atelier shows beside the title; empty when there is no source.
ATELIER_VERSION=""

# The repository the project is published from. Taken from the website
# configuration rather than the Git remote, so a fork documents the repository
# it publishes as, and a checkout with no remote still renders.
REPO_SLUG="$(sed -n -e '/^[[:space:]]*repo-url:/{' \
	-e 's|^[[:space:]]*repo-url:[[:space:]]*https://github.com/\([^[:space:]]*\)|\1|p' \
	-e q -e '}' "${DOCS_DIR}/_quarto.yml")"
REPO_SLUG="${REPO_SLUG%/}"
if [[ -z "${REPO_SLUG}" ]]; then
	# `|| true` covers the whole pipeline: `git remote get-url` exits 2 when there
	# is no origin, and under `pipefail` that would end the render here rather
	# than at the error below, which says what is actually missing.
	REPO_SLUG="$(git -C "${ROOT_DIR}" remote get-url origin 2>/dev/null |
		sed -n 's|.*github\.com[:/]\(.*\)|\1|p' | sed 's|\.git$||' || true)"
fi
if [[ -z "${REPO_SLUG}" ]]; then
	printf '[pre-render] No repo-url in _quarto.yml and no origin remote\n' >&2
	exit 1
fi

if [[ -n "${EXTENSION_NAME}" ]]; then
	MANIFEST="${ROOT_DIR}/_extensions/${EXTENSION_NAME}/_extension.yml"
	VERSION="$(read_version "${MANIFEST}")"
	if [[ -z "${VERSION}" ]]; then
		printf '[pre-render] No version in %s\n' "${MANIFEST}" >&2
		exit 1
	fi
	if ! git -C "${ROOT_DIR}" rev-parse -q --verify "refs/tags/${VERSION}" >/dev/null; then
		# Expected before a first release, and a warning rather than an error: the
		# workflow renders from a tag, so this only fires on a local preview.
		printf '[pre-render] warning: %s is not tagged; the install commands name an unreleased version\n' \
			"${VERSION}" >&2
	fi

	{
		printf '# Generated by _scripts/pre-render.sh. Do not edit.\n'
		printf 'extension:\n'
		printf '  name: "%s"\n' "${EXTENSION_NAME}"
		printf '  repo: "%s"\n' "${REPO_SLUG}"
		printf '  version: "%s"\n' "${VERSION}"
		printf '  reference: "%s@%s"\n' "${REPO_SLUG}" "${VERSION}"
		# The same reference, encoded for the repo query parameter of a Quarto
		# Wizard URI.
		printf '  wizard-reference: "%s%%40%s"\n' "${REPO_SLUG//\//%2F}" "${VERSION}"
	} >"${DOCS_DIR}/_variables.yml"

	printf '[pre-render] _variables.yml (%s@%s)\n' "${REPO_SLUG}" "${VERSION}"
	ATELIER_VERSION="${VERSION}"
elif [[ -f "${ROOT_DIR}/CITATION.cff" ]]; then
	ATELIER_VERSION="$(read_version "${ROOT_DIR}/CITATION.cff")"
fi

if [[ -n "${ATELIER_VERSION}" ]]; then
	{
		printf '# Generated by _scripts/pre-render.sh. Do not edit.\n'
		printf 'extensions:\n'
		printf '  atelier:\n'
		printf '    version: "%s"\n' "${ATELIER_VERSION}"
	} >"${DOCS_DIR}/_atelier-version.yml"

	printf '[pre-render] _atelier-version.yml (%s)\n' "${ATELIER_VERSION}"
else
	printf '[pre-render] No extension manifest or CITATION.cff version; not writing _atelier-version.yml\n'
fi

# The Open Graph card, cached from GitHub's own repository preview. The first
# path segment is a cache key GitHub accepts any value for. Written through a
# temporary file so a failed fetch cannot truncate a good cache.
#
# A card under a day old is left alone. The endpoint rate-limits, and a preview
# session re-runs this script on every full render, so refetching each time
# earns a 429 rather than a fresher card. CI checks out a fresh tree, where
# nothing is cached, so it always fetches.
#
# `--retry` covers that rate limiting: curl counts HTTP 429 as a transient
# error, alongside 408 and the 5xx family, and honours any Retry-After.
# `--max-time` bounds one attempt only, and a long Retry-After can hold each
# retry for minutes. `--retry-max-time` starts no retry after a minute, so with
# the 20 seconds of the attempt in flight the fetch ends within 80 seconds.
CARD_URL="https://opengraph.githubassets.com/1/${REPO_SLUG}"
CARD_REL="assets/social/og-image.png"
CARD_PATH="${DOCS_DIR}/${CARD_REL}"

# GitHub answers 200 with a generic Octocat placeholder, rather than 404, when
# the repository is private or does not exist. That placeholder must never be
# published: it carries none of the repository name, description, avatar, or
# counts that the card's `image-alt` tells a screen reader are in the picture.
#
# It is told apart by its shape. GitHub renders the placeholder at 1200x630 and
# a real card at 1200x600, and a PNG carries its height as a big-endian 32-bit
# integer at byte offset 20, inside the IHDR chunk, which `od` reads without
# adding an image tool to the render. The placeholder has also been
# byte-identical across repositories, but a re-encode would change that while
# the height held, so the height is the more durable of the two signals.
PLACEHOLDER_HEIGHT="00000276" # 630, against 00000258 for the 600 of a real card

card_height() {
	od -An -tx1 -j20 -N4 "$1" 2>/dev/null | tr -d ' \n'
}

# A card that exists and that Git does not ignore is a committed one, put there
# by the scaffold from a collection of cards, and is never fetched over or
# replaced. A fetched cache is ignored by Git, which is what tells the two
# apart. `check-ignore -q` exits 1 for a path that is not ignored and 0 for one
# that is. Any other status means there is no work tree to ask, as in a source
# archive; a card that exists is then kept, so it is never fetched over.
# The same rule as resolve_social_card in the scaffold's scaffold-docs.sh.
card_is_committed() {
	[[ -f "${CARD_PATH}" ]] || return 1
	local status=0
	git -C "${DOCS_DIR}" check-ignore -q "${CARD_REL}" 2>/dev/null || status=$?
	[[ "${status}" -ne 0 ]]
}

# Shared triage for a render with no real card to show. Anything already cached
# is better than nothing, a publishing render must not go ahead without one, and
# a local render or a pull request check is not worth failing.
#
# Refusing to publish matters because nothing else would notice: Quarto reports
# a missing include as FATAL and renders the page anyway, and says nothing at
# all about a card image that does not resolve, so a missing card would
# reach the live site as an og:image pointing at a 404, behind a green check.
card_unavailable() {
	local reason="$1"
	if [[ -f "${CARD_PATH}" ]]; then
		printf '[pre-render] warning: %s; keeping the cached card\n' "${reason}" >&2
		return 0
	fi
	if [[ -n "${CI:-}" && "${GITHUB_EVENT_NAME:-}" != "pull_request" ]]; then
		printf '[pre-render] %s, and nothing is cached; refusing to publish a broken og:image\n' \
			"${reason}" >&2
		exit 1
	fi
	printf '[pre-render] warning: %s, and nothing is cached; og:image will point at a missing file\n' \
		"${reason}" >&2
}

# A site whose configuration never names the card uses a social image of its
# own, so the card is neither fetched nor required, and a rate-limited fetch
# cannot fail a render that would not publish it. Comments are stripped first,
# so a comment that mentions the path does not count. The process substitution
# keeps sed out of the exit status: `grep -q` stops at the first match, and
# under pipefail the SIGPIPE that sed then gets would read as no match.
if ! grep -qF "${CARD_REL}" < <(sed 's/#.*//' "${DOCS_DIR}/_quarto.yml"); then
	printf '[pre-render] _quarto.yml does not use %s; not fetching the social card\n' "${CARD_REL}"
elif card_is_committed; then
	printf '[pre-render] Using the committed social card %s; not fetching\n' "${CARD_REL}"
elif [[ -n "$(find "${CARD_PATH}" -mtime -1 2>/dev/null)" ]]; then
	printf '[pre-render] Social card cached under a day ago; not refetching\n'
elif ! curl -fsSL --max-time 20 --retry 3 --retry-delay 2 --retry-max-time 60 --create-dirs \
	"${CARD_URL}" -o "${CARD_PATH}.tmp"; then
	rm -f "${CARD_PATH}.tmp"
	card_unavailable "could not fetch ${CARD_URL}"
elif [[ "$(card_height "${CARD_PATH}.tmp")" == "${PLACEHOLDER_HEIGHT}" ]]; then
	rm -f "${CARD_PATH}.tmp"
	card_unavailable "${CARD_URL} returned GitHub's placeholder, so the repository is private or does not exist yet"
else
	mv "${CARD_PATH}.tmp" "${CARD_PATH}"
	printf '[pre-render] %s -> assets/social/og-image.png\n' "${CARD_URL}"
fi

if [[ ! -f "${ROOT_DIR}/CHANGELOG.md" ]]; then
	cat >"${DOCS_DIR}/changelog.qmd" <<'EOF'
---
title: "Changelog"
description: "No changelog is available for this project."
---

No changelog available.
EOF
	printf '[pre-render] No CHANGELOG.md; wrote a placeholder changelog.qmd\n'
	exit 0
fi

awk -v name="${PROJECT_NAME}" '
BEGIN {
  in_unreleased = 0
  in_version    = 0
  cur_major     = -1
  cur_minor     = -1
  prev_blank    = 1
  printf "---\ntitle: \"Changelog\"\nsubtitle: \"What changed, and when.\"\n"
  printf "description: \"Every released version of %s, and what each one changed.\"\n---\n\n", name
}

# Emit a line, collapsing consecutive blank lines and suppressing leading ones.
function emit(line,    is_blank) {
  is_blank = (line == "")
  if (is_blank) {
    if (!prev_blank) { print ""; prev_blank = 1 }
  } else {
    print line
    prev_blank = 0
  }
}

/^# /             { next }
/^## Unreleased$/ { in_unreleased = 1; next }

# Inside the Unreleased block: skip content, stop on next versioned heading.
in_unreleased && !/^## [0-9]/ { next }
in_unreleased                  { in_unreleased = 0 }

/^## [0-9]+\.[0-9]+\.[0-9]+ \(/ {
  # Fields: $1="##"  $2="X.Y.Z"  $3="(date)"
  ver   = $2
  date  = substr($3, 2, length($3) - 2)   # strip surrounding parens
  split(ver, v, ".")
  major = int(v[1])
  minor = int(v[2])
  patch = int(v[3])

  if (major != cur_major) {
    emit("")
    emit("## " major " {#version-" major "}")
    emit("")
    cur_major = major
    cur_minor = -1
  }

  if (minor != cur_minor) {
    emit("### " major "." minor " {#version-" major "-" minor "}")
    emit("")
    cur_minor = minor
  }

  emit("#### " major "." minor "." patch " (" date ") " \
       "{#version-" major "-" minor "-" patch "}")
  in_version = 1
  next
}

# Headings nested under a version follow it down by two levels, so they stay
# inside the version they document.
in_version && /^#+ / {
  if (length($1) + 2 > 6) {
    printf "[pre-render] heading too deep to nest: %s\n", $0 > "/dev/stderr"
    emit($0)
  } else {
    emit("##" $0)
  }
  next
}

# A changelog entry naming one of the shortcodes the extension provides, as
# `{{< bam >}}`, is expanded by Quarto rather than shown. The site is not
# rendered by that format, so the expansion fails the render outright.
# Escaping to the Quarto literal form leaves the text visible.
function escape_shortcodes(line) {
  gsub(/{{{</, "\001", line)
  gsub(/>}}}/, "\002", line)
  gsub(/{{</, "{{{<", line)
  gsub(/>}}/, ">}}}", line)
  gsub(/\001/, "{{{<", line)
  gsub(/\002/, ">}}}", line)
  return line
}

{ emit(escape_shortcodes($0)) }
' "${ROOT_DIR}/CHANGELOG.md" >"${DOCS_DIR}/changelog.qmd"

printf '[pre-render] CHANGELOG.md -> changelog.qmd\n'
