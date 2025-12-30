# Logic Diagram Action

A GitHub Action that generates architecture diagrams from pull request content using the [Logic.inc](https://logic.inc) API.

## Features

- Generate architecture diagrams from PR title, description, and code diff
- Trigger via PR comments (`/generate-diagram`)
- Refresh expired diagram URLs (`/refresh-diagram`)
- Automatic handling of large diffs (truncation)
- Rate limit handling with retry
- Non-blocking failures (errors posted as PR comments)

## Quick Start

### 1. Get Your Logic.inc Credentials

1. Log into your [Logic.inc dashboard](https://logic.inc)
2. Navigate to **API Keys** and create/copy your API token
3. Navigate to **Documents** and copy the UUID of your diagram document

### 2. Configure Your Repository

1. Go to your repository **Settings** → **Secrets and variables** → **Actions**
2. Add a secret: `LOGIC_API_TOKEN` = your API token
3. Add a variable: `LOGIC_DOCUMENT_ID` = your document UUID

### 3. Create Workflow File

Create `.github/workflows/logic-diagram.yml`:

```yaml
name: Logic Diagram

on:
  issue_comment:
    types: [created]

jobs:
  diagram:
    # Only run on PR comments containing diagram commands
    if: |
      github.event.issue.pull_request &&
      (contains(github.event.comment.body, '/generate-diagram') ||
       contains(github.event.comment.body, '/refresh-diagram'))
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read

    steps:
      - name: Logic Diagram Action
        uses: with-logic/logic-diagram-action@v1
        with:
          document_id: ${{ vars.LOGIC_DOCUMENT_ID }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          LOGIC_API_TOKEN: ${{ secrets.LOGIC_API_TOKEN }}
```

### 4. Test It

1. Open a pull request
2. Comment `/generate-diagram`
3. Wait for the diagram to appear

## Usage

### Commands

| Command             | Description                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| `/generate-diagram` | Generate a new architecture diagram from PR content                      |
| `/refresh-diagram`  | Refresh the image URL of an existing diagram (URLs expire after ~1 hour) |

### Inputs

| Input             | Required | Default | Description                                        |
| ----------------- | -------- | ------- | -------------------------------------------------- |
| `document_id`     | Yes      | -       | Logic.inc document UUID from your dashboard        |
| `timeout`         | No       | `600`   | API timeout in seconds                             |
| `max_diff_length` | No       | `50000` | Maximum diff length before truncation (characters) |

### Outputs

| Output       | Description                                    |
| ------------ | ---------------------------------------------- |
| `image_url`  | Presigned URL of the generated diagram         |
| `file_id`    | Persistent file ID for refresh operations      |
| `comment_id` | GitHub comment ID where the diagram was posted |

### Environment Variables

| Variable          | Required | Description                                                         |
| ----------------- | -------- | ------------------------------------------------------------------- |
| `GITHUB_TOKEN`    | Yes      | GitHub token for API access (usually `${{ secrets.GITHUB_TOKEN }}`) |
| `LOGIC_API_TOKEN` | Yes      | Logic.inc API token for authentication                              |

## Error Handling

The action handles errors gracefully by posting informative comments:

- **Rate Limited**: When API rate limits are exceeded
- **Payload Too Large**: When the PR diff is too large even after truncation
- **Timeout**: When diagram generation takes too long
- **Fork PRs**: Diagram generation is skipped for security (secrets not available)
- **Draft PRs**: Silently skipped to avoid unnecessary generation

## Permissions

The workflow requires these permissions:

```yaml
permissions:
  pull-requests: write # To post/update comments
  contents: read # To read PR diff
```

## Limitations

- **Fork PRs**: Cannot generate diagrams for PRs from forks (GitHub security restriction)
- **Image URL Expiry**: Diagram URLs expire after ~1 hour (use `/refresh-diagram`)
- **Large Diffs**: Very large PRs may be truncated for processing

## Troubleshooting

### "Diagram Generation Skipped" on fork PRs

This is expected behavior. GitHub Actions cannot access secrets for workflows triggered by PRs from forks.

### "Rate Limited" error

Your Logic.inc API rate limit has been exceeded. Wait and try again later.

### Image not loading

The presigned URL may have expired. Comment `/refresh-diagram` to get a fresh URL.

### Timeout error

The PR may be too complex. Consider breaking it into smaller PRs.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run linting
npm run lint

# Build
npm run build
```

## License

MIT
