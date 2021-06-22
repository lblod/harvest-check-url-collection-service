# harvest-check-url-service
Microservice that checks if all urls were properly processed during the collecting step.


## Usage

### Docker-compose
Add the following snippet in your `docker-compose.yml`:
```
  harvest:
    image: lblod/harvest-check-url-service
    volumes:
      - ./data/files:/share
```


