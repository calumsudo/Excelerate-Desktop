# Changelog

## [1.1.0](https://github.com/calumsudo/Excelerate-Desktop/compare/v1.0.0...v1.1.0) (2026-07-15)


### Features

* add React error boundary so one crash doesn't blank the app ([#46](https://github.com/calumsudo/Excelerate-Desktop/issues/46)) ([155d5e3](https://github.com/calumsudo/Excelerate-Desktop/commit/155d5e35dc94a448e0c67c5126772965effd28fe)), closes [#44](https://github.com/calumsudo/Excelerate-Desktop/issues/44)


### Bug Fixes

* **a11y:** resolve react-doctor accessibility findings ([#33](https://github.com/calumsudo/Excelerate-Desktop/issues/33)) ([#38](https://github.com/calumsudo/Excelerate-Desktop/issues/38)) ([872baac](https://github.com/calumsudo/Excelerate-Desktop/commit/872baaceecfa34c92433bf84506f6d9eb21a3270))
* **deps:** bump @internationalized/date to 3.12.0 to match HeroUI ([#45](https://github.com/calumsudo/Excelerate-Desktop/issues/45)) ([633b1c3](https://github.com/calumsudo/Excelerate-Desktop/commit/633b1c3513f58b8eb86c3d00a4f4cc89bc2c5878))
* **react-doctor:** resolve bug-level warnings ([#30](https://github.com/calumsudo/Excelerate-Desktop/issues/30)) ([#40](https://github.com/calumsudo/Excelerate-Desktop/issues/40)) ([8283105](https://github.com/calumsudo/Excelerate-Desktop/commit/8283105324a8816088cda933c9293e7edaf88dcd))
* **rls:** restrict funders/industries lookup-table writes to admins ([#35](https://github.com/calumsudo/Excelerate-Desktop/issues/35)) ([4c4dcb0](https://github.com/calumsudo/Excelerate-Desktop/commit/4c4dcb0e1b6a1b97cde4888cdf0f5aa605febf09)), closes [#28](https://github.com/calumsudo/Excelerate-Desktop/issues/28)


### Performance Improvements

* resolve react-doctor performance findings ([#31](https://github.com/calumsudo/Excelerate-Desktop/issues/31)) ([#39](https://github.com/calumsudo/Excelerate-Desktop/issues/39)) ([d136791](https://github.com/calumsudo/Excelerate-Desktop/commit/d1367910cd99ef56e1ab4785b09b99c4f58b1199))

## [1.0.0](https://github.com/calumsudo/Excelerate-Desktop/compare/v0.1.1...v1.0.0) (2026-07-14)


### ⚠ BREAKING CHANGES

* release-please now follows standard semver regardless of pre-1.0 status, so this release moves to 1.0.0.

### Features

* add combined portfolio view and funder drill-down to dashboard ([#19](https://github.com/calumsudo/Excelerate-Desktop/issues/19)) ([9bd06fd](https://github.com/calumsudo/Excelerate-Desktop/commit/9bd06fd5149905a0da8f1799dc2b6c0b1c2c5b50))
* add Deal Lookup page — filter/pivot/chart/export, deal CRUD, unmatched reconciliation ([#20](https://github.com/calumsudo/Excelerate-Desktop/issues/20)) ([71cc662](https://github.com/calumsudo/Excelerate-Desktop/commit/71cc662faee92e1d4cac2d9bfe7c3290d43c2f61))
* add Phase 2 cloud saves — pivot commit RPC, Storage uploads, reconciliation UI ([#15](https://github.com/calumsudo/Excelerate-Desktop/issues/15)) ([a785425](https://github.com/calumsudo/Excelerate-Desktop/commit/a7854254b4bd7ae3c9816331fb31fcf0eae13bbb))
* add Phase 3 one-time workbook import — Rust parser, import RPC, wizard UI ([#16](https://github.com/calumsudo/Excelerate-Desktop/issues/16)) ([a49b63d](https://github.com/calumsudo/Excelerate-Desktop/commit/a49b63dd6e927f98c0ac5c6e877fea797ad37bd2))
* add Phase 4 dashboard — Supabase view-backed charts, KPI cards, portfolio switcher ([#17](https://github.com/calumsudo/Excelerate-Desktop/issues/17)) ([0662f31](https://github.com/calumsudo/Excelerate-Desktop/commit/0662f31a60b9cda2ac9415682ed1e5cbf1ea7fcc))
* add Phase 5 workbook export, retire SQLite/Pyodide local machinery ([#18](https://github.com/calumsudo/Excelerate-Desktop/issues/18)) ([a22c43f](https://github.com/calumsudo/Excelerate-Desktop/commit/a22c43f6ef1709fe8971b3410e92795518422f1a))
* AI chat page with database tools, file uploads, and multiple providers ([#21](https://github.com/calumsudo/Excelerate-Desktop/issues/21)) ([b2eed53](https://github.com/calumsudo/Excelerate-Desktop/commit/b2eed53b1f0f0909f59969dbe76242e4bf07af81))
* complete Phase 1 Supabase schema — payments tables, access RLS, analytics views ([#14](https://github.com/calumsudo/Excelerate-Desktop/issues/14)) ([ffaba65](https://github.com/calumsudo/Excelerate-Desktop/commit/ffaba65992716c30842bc646d45f9b150d5dab25))
* improve unmatched deals handling and parser refinements ([#12](https://github.com/calumsudo/Excelerate-Desktop/issues/12)) ([000e9ec](https://github.com/calumsudo/Excelerate-Desktop/commit/000e9ec3dc9b69ca90767bfc6bba4b2b884fa4b8))
* show release notes modal on update and from settings ([#23](https://github.com/calumsudo/Excelerate-Desktop/issues/23)) ([4313d4b](https://github.com/calumsudo/Excelerate-Desktop/commit/4313d4b4ed76d4a8ebfbf1b5a71793ff45ba0fcf))


### Bug Fixes

* baseline supabase schema, remove dead code, make clearview re-uploads idempotent ([#13](https://github.com/calumsudo/Excelerate-Desktop/issues/13)) ([4da69eb](https://github.com/calumsudo/Excelerate-Desktop/commit/4da69eb2e77e2c94b62eac020c10ab38bd6cec7d))
* scope BIG parser to report month, fix ClearView sheet names, pass CalendarDate ([#10](https://github.com/calumsudo/Excelerate-Desktop/issues/10)) ([d0cd584](https://github.com/calumsudo/Excelerate-Desktop/commit/d0cd584b9838534f7f4d66ff28710b5ddae76e24))


### Miscellaneous Chores

* use standard semver bumps for release-please ([#24](https://github.com/calumsudo/Excelerate-Desktop/issues/24)) ([af98edc](https://github.com/calumsudo/Excelerate-Desktop/commit/af98edce757ddf1173580aa64bb0131d4a3d2a1f))

## [0.1.1](https://github.com/calumsudo/Excelerate-Desktop/compare/v0.1.0...v0.1.1) (2026-05-06)


### Features

* add Boom monthly funder support for Alder and White Rabbit portfolios ([b7f2697](https://github.com/calumsudo/Excelerate-Desktop/commit/b7f269796f054ddc1e7eac2bd31114560ede1056))
* add database versioning system for portfolio workbooks and funder uploads ([9a136bb](https://github.com/calumsudo/Excelerate-Desktop/commit/9a136bb7721652a4c56751fb18ca43f44e6d7f7d))
* add delete functionality for funder uploads ([43d6493](https://github.com/calumsudo/Excelerate-Desktop/commit/43d6493a8d181bd3a1124b3ac61d39154bfa1562))
* Add dialog plugin and enhance file handling capabilities ([605900f](https://github.com/calumsudo/Excelerate-Desktop/commit/605900f909c15193ce39304ffd7f944183ec491f))
* add eFin parser for funding data processing ([6d23c76](https://github.com/calumsudo/Excelerate-Desktop/commit/6d23c7679ee1d47b89242500f3538c96183f79ad))
* add file handling capabilities for portfolio workbooks ([3b5f356](https://github.com/calumsudo/Excelerate-Desktop/commit/3b5f356301b99adb6db289b0d31122b916888843))
* add file viewer and Clearview parser components ([1b57e07](https://github.com/calumsudo/Excelerate-Desktop/commit/1b57e07aeb87d18644d2668a9413028331b9d720))
* add functionality to delete portfolio workbooks and update related components ([2a9e657](https://github.com/calumsudo/Excelerate-Desktop/commit/2a9e657b4ba302a5e0e91ff8f0326e0cce1d5f73))
* add InAdvance parser for weekly CSV files ([46b85b5](https://github.com/calumsudo/Excelerate-Desktop/commit/46b85b575d410213cbd9b2880f0984d8330f14f2))
* add Kings monthly funder parser and integration ([c30da3f](https://github.com/calumsudo/Excelerate-Desktop/commit/c30da3f0139d434aec27b71a4181ef269270fe2f))
* add merchant extraction from portfolio workbooks ([1471f57](https://github.com/calumsudo/Excelerate-Desktop/commit/1471f57d4d44b51489009fee38891f00b2565e89))
* add toast notifications and file validation system ([829e4d4](https://github.com/calumsudo/Excelerate-Desktop/commit/829e4d4ddb8441ae8ab0e1626a88645758bb6d74))
* add unmatched deals detection backend ([1cf373c](https://github.com/calumsudo/Excelerate-Desktop/commit/1cf373c8e4a26bae69c1245e7f0a8892faeae5f0))
* add unmatched deals frontend services ([ef5baa9](https://github.com/calumsudo/Excelerate-Desktop/commit/ef5baa907916c3b60742b6c330c8c59269b544bf))
* add unmatched deals modal components ([5534a9d](https://github.com/calumsudo/Excelerate-Desktop/commit/5534a9d19ebf5bece0f891b2df5ed6419c83c044))
* **auth:** setup supabase authentication ([bd6ea8f](https://github.com/calumsudo/Excelerate-Desktop/commit/bd6ea8f5df380e5ebe213e216352f775f9a25dd4))
* **auth:** setup supabase authentication ([153f9c0](https://github.com/calumsudo/Excelerate-Desktop/commit/153f9c09a619c73e16255bd54ba55e1022280e06))
* daily clearview uploads working ([58e1083](https://github.com/calumsudo/Excelerate-Desktop/commit/58e1083b26587c4e0e756122a14f6d8e4fdd2076))
* expand weekly funders list with additional funders and accepted file types ([1cbdcdb](https://github.com/calumsudo/Excelerate-Desktop/commit/1cbdcdb60af23e38b12e9344d9f26529f45f127b))
* implement file upload functionality for funders and enhance portfolio components ([c0fa795](https://github.com/calumsudo/Excelerate-Desktop/commit/c0fa795c974ddd27223b2010d5c2fbf389f65f8d))
* implement parser system for funder file processing ([6ad6720](https://github.com/calumsudo/Excelerate-Desktop/commit/6ad6720a4d69572ff502006b7604674331f62704))
* implement theme context and toggle functionality ([b8615c0](https://github.com/calumsudo/Excelerate-Desktop/commit/b8615c08db4cc2d88edbf12e9681ac96a2b81593))
* improve UI responsiveness and layout organization ([6dc633c](https://github.com/calumsudo/Excelerate-Desktop/commit/6dc633c8340e8e481c49f4547742d970fba8e287))
* integrate unmatched deals into portfolio pages ([21dfa95](https://github.com/calumsudo/Excelerate-Desktop/commit/21dfa952af1911b1ab1cc319aaac8224b70d9aa3))
* linting and prettier formatting ([8f957c3](https://github.com/calumsudo/Excelerate-Desktop/commit/8f957c3478d710d5484721cee582dd7466703b6a))
* persist Clear View daily files in upload section across page navigation ([7a012c6](https://github.com/calumsudo/Excelerate-Desktop/commit/7a012c606f05c6172176918aba3473cc93df8f2a))
* refine theme toggle button styling and layout adjustments ([16e7e22](https://github.com/calumsudo/Excelerate-Desktop/commit/16e7e227b26d7ab0be6524d6094a2bb70f61655d))
* remove PortfolioSelector component and integrate sidebar navigation ([e88dfca](https://github.com/calumsudo/Excelerate-Desktop/commit/e88dfcac51998660dca0de6f55128d1691a48932))
* replace SheetJS with Pyodide/openpyxl for Excel manipulation ([a0e0778](https://github.com/calumsudo/Excelerate-Desktop/commit/a0e07780473861a53e2bd98a0ba0e9f406cd8e82))
* skip processing of rows with zero net amounts in BIG parser ([7ace27a](https://github.com/calumsudo/Excelerate-Desktop/commit/7ace27a247f14fac6cbea6049d4df1d5c4305338))
* switch from weekly to monthly format ([2f4383e](https://github.com/calumsudo/Excelerate-Desktop/commit/2f4383e28f32ba82f350b1667a890c8568c87ea9))
* switching to monthly upload format ([b4380ff](https://github.com/calumsudo/Excelerate-Desktop/commit/b4380ffbe92b786c00bec93e4d55bad80835e0b0))
* update BIG to calculate the management fee and gross amount payed ([8ae8e3c](https://github.com/calumsudo/Excelerate-Desktop/commit/8ae8e3c7d06d21b2d425b6c052cba81845da7c9e))
* update dependencies and add Friday date picker component ([01b1c10](https://github.com/calumsudo/Excelerate-Desktop/commit/01b1c1014f9a352e11dd544f65eef3d5a1e3f5fd))
* update page title and modify funder data for file uploads ([131a584](https://github.com/calumsudo/Excelerate-Desktop/commit/131a5849d66c151b521a32d9f65094457e46be59))


### Bug Fixes

* big parser ([3d23da8](https://github.com/calumsudo/Excelerate-Desktop/commit/3d23da817e963a77446c10bb93b2afd3c86fe4b1))
* Clear View daily and weekly upload functionality ([ab879f0](https://github.com/calumsudo/Excelerate-Desktop/commit/ab879f01849d52b24e3cec531ee70a6a769e14de))
* prevent blank screen on double-click of sidebar items ([90ce290](https://github.com/calumsudo/Excelerate-Desktop/commit/90ce2901dec62fafd9d946e20c77f928ae6403e8))
* remove hero icons library ([b37dd42](https://github.com/calumsudo/Excelerate-Desktop/commit/b37dd42100beb05e8424e82e5ff0952dbe321146))
* remove rounding on totals of BIG ([ad3ae60](https://github.com/calumsudo/Excelerate-Desktop/commit/ad3ae605c47cd69a3ca104c612cd69c40bca9ded))
* year formatting ([19fade3](https://github.com/calumsudo/Excelerate-Desktop/commit/19fade35062442d42c1f2a96a9774dc98401d2c8))
