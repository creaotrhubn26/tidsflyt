# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Hopp til hovedinnhold" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - main [ref=e4]:
    - generic [ref=e5]:
      - img [ref=e7]
      - generic [ref=e9]:
        - heading "Noe gikk galt" [level=1] [ref=e10]
        - paragraph [ref=e11]: En uventet feil oppsto. Prøv å laste siden på nytt.
      - generic [ref=e12]: headerActivitiesData.map is not a function
      - generic [ref=e13]:
        - button "Prøv igjen" [ref=e14] [cursor=pointer]
        - button "Gå til forsiden" [ref=e15] [cursor=pointer]
  - generic [ref=e18]:
    - generic [ref=e19]: "[plugin:runtime-error-plugin] headerActivitiesData.map is not a function"
    - generic [ref=e20]: /Users/usmanqazi/tidum/tidsflyt/client/src/components/portal/portal-layout.tsx:190:41
    - generic [ref=e21]: "188| }; 189| 190| const mapped = headerActivitiesData.map((activity) => ({ | ^ 191| id: activity.id, 192| type: actionTypeMap[activity.action] || (\"stamp\" as const),"
    - generic [ref=e22]: at /Users/usmanqazi/tidum/tidsflyt/client/src/components/portal/portal-layout.tsx:190:41 at PortalLayout /Users/usmanqazi/tidum/tidsflyt/client/src/components/portal/portal-layout.tsx:179:31
    - generic [ref=e23]:
      - text: Click outside, press Esc key, or fix the code to dismiss.
      - text: You can also disable this overlay by setting
      - code [ref=e24]: server.hmr.overlay
      - text: to
      - code [ref=e25]: "false"
      - text: in
      - code [ref=e26]: vite.config.js
      - text: .
```