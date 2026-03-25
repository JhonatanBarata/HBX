self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [
      {
        "source": "/hbx/static/:path*"
      },
      {
        "source": "/hbx/webscraping/:path*"
      },
      {
        "source": "/hbx/webscraping"
      }
    ],
    "beforeFiles": [],
    "fallback": []
  },
  "sortedPages": [
    "/_app",
    "/_error"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()