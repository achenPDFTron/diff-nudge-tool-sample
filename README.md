# DiffNudgeToolSample

Angular sample for the diff nudge tool.

Notes:
- Please have a look at the Angular.json script and asset section.

- Code in app.component.html was copied from index.html of the diff sample

- I copied and pasted the HTML code for the nudge tool. Ensure that the element ID matches what is specified in the nudge-tool.js.

- I did not bother with using "setUpNudgeToolAndAppendToIFrame()" as that will put the nudge tool in the iFrame. By doing this, this allows more customization on the developer's end.

- Majority of the code in app.component.ts has been copied and pasted from the diff.js file (I mainly changed the callback to use arrow functions so that "this" works properly). I didn't really bother to add parameter/ variable typing and changing "var" to be "let/const".

- I did not bother to include diff.js in the scripts in Angular.json as it throws some errors when its executed.

- Did not bother to use "Workers" as it looks like the CoreControls.js file throw errors when executed. From speaking with one of our experienced developers, not using Workers will not impact the applications in any major ways. It's just a "nice to have".

- There will be warnings: "There may be some degradation of performance. Your server has not been configured to serve .gz. and .br. files with the expected Content-Encoding."
Off the top of my head, that can be resolved by setting the content encoding for server side rendering: https://angular.io/guide/universal#using-absolute-urls-for-server-requests
