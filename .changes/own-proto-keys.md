---
type: Fixed
---
**A key named `__proto__` shows as the key it is.** It is an ordinary key in
JSON, a header or a form field, but Blix copied captured data with plain
assignment, which turned it into the copy's prototype instead: the key
disappeared from the body, the headers or an error's details, and the copy
inherited its value. An API tested against prototype pollution sends exactly
that. It is now kept as an own key everywhere Blix copies, stores and exports
data, and an XHR response header named `constructor` is no longer joined with
a value the object only inherits.
