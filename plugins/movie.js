Download Sources
GET
/api/sources/{id}
Get download links for a movie in multiple quality options (360p, 480p, 720p).

Parameters
Name	Type	Description
id	string	Movie ID (from search or info endpoints)
season	string	Season number(tv shows only - not applicable to single movies)ie ?season=2
episode	string	Episode number(tv shows only - not applicable to single movies)ie ?season=2&episode=5
Example Request(Movie)
GET https://movieapi.giftedtech.co.ke/api/sources/5099284245269335848
Example Request(Tv Show)
GET https://movieapi.giftedtech.co.ke/api/sources/9028867555875774472?season=1&episode=1
Example Response
{
  "status": 200,
  "success": "true",
  "creator": "GiftedTech",
  "results": [
    {
      "id": "6711075405405062752",
      "quality": "360p",
      "download_url": "https://movieapi.giftedtech.co.ke/api/download/https%3A%2F%2Fbcdnw.hakunaymatata.com%2Fbt%2F994d9849486c58a5833a68102e23d844.mp4%3Fsign%3D27bd431265e89b6727a0074578e418cc%26t%3D1760951408",
      "size": "320426512",
      "format": "mp4"
    },
    {
      "id": "6969422155025367968",
      "quality": "480p",
      "download_url": "https://movieapi.giftedtech.co.ke/api/download/https%3A%2F%2Fbcdnw.hakunaymatata.com%2Fresource%2F3846d72b375207fe7380a44d73fd5aef.mp4%3Fsign%3Dfda9096cee21b8201af298502e715e6e%26t%3D1760950499",
      "size": "647283481",
      "format": "mp4"
    },
    {
      "id": "8113772324396090712",
      "quality": "720p",
      "download_url": "https://movieapi.giftedtech.co.ke/api/download/https%3A%2F%2Fbcdnw.hakunaymatata.com%2Fresource%2F00ea739c2e99522d54b6009b2e474342.mp4%3Fsign%3D95b19d10234bf7609e8e63358910d3d2%26t%3D1760950345",
      "size": "647283481",
      "format": "mp4"
    }
  ]
}