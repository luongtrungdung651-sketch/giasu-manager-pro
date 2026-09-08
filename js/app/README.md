# Application shell

`app.js` contains the legacy application shell that previously lived inside
`index.html`. It remains a classic script deliberately: the interface still
uses global functions from inline `onclick` handlers, and the existing core
scripts must load before it.

## Safe next extractions

Move one cohesive screen at a time from `app.js` to a sibling file, load it
after its dependencies, and expose only the functions that HTML handlers call
through `window`. Recommended order: tutor settings, finance, reports,
admin, then authentication.

Do not change the load order in `index.html` without testing login, student
detail, calendar, payments, and group classes.
