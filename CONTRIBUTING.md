# Contributing to Tidsflyt

Thank you for your interest in contributing to Tidsflyt! This document provides guidelines and instructions for contributing.

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites
- Node.js 20.x or higher
- PostgreSQL 14+ (or Neon account)
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/creaotrhubn26/tidsflyt.git
   cd tidsflyt
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run database migrations**
   ```bash
   npm run db:push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:5000`

## Development Workflow

### Branch Strategy
- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/feature-name` - New features
- `fix/bug-name` - Bug fixes
- `hotfix/critical-fix` - Production hotfixes

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Follow existing code style
   - Add comments for complex logic

3. **Test your changes**
   ```bash
   npm test
   npm run lint
   npm run check
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

5. **Push to GitHub**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Go to GitHub and create a PR
   - Fill out the PR template
   - Link any related issues
   - Wait for code review

## Code Style

### TypeScript/JavaScript
- Use TypeScript for type safety
- Use functional components with hooks (React)
- Prefer `const` over `let`, avoid `var`
- Use meaningful variable names
- Keep functions small and focused

### React Components
```typescript
// Good
export function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading } = useQuery(...);
  
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <EmptyState />;
  
  return <div>...</div>;
}

// Avoid
export default function component(props: any) {
  // ...
}
```

### Backend Code
```typescript
// Use async/await instead of callbacks
async function getUser(id: string) {
  const user = await db.select().from(users).where(eq(users.id, id));
  return user;
}

// Handle errors properly
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error('Operation failed:', error);
  throw new AppError(500, 'Operation failed');
}
```

## Testing

### Writing Tests
- Write tests for new features
- Update tests when changing existing features
- Aim for >80% code coverage

### Test Structure
```typescript
describe('Component/Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something specific', () => {
    // Arrange
    const input = { ... };
    
    // Act
    const result = doSomething(input);
    
    // Assert
    expect(result).toBe(expected);
  });

  it('should handle error cases', () => {
    // Test error scenarios
  });
});
```

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- user.test.ts
```

## Pull Request Guidelines

### PR Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] No linting errors
- [ ] Documentation updated
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with main

### PR Description
Include:
- What changes were made
- Why the changes were necessary
- How to test the changes
- Screenshots (if UI changes)
- Related issues/tickets

### Code Review Process
1. Automated checks must pass (CI/CD)
2. At least one approving review required
3. Address all review comments
4. Squash commits before merging (if requested)

## Documentation

### Code Comments
```typescript
/**
 * Calculates total hours worked in a month
 * @param entries - Array of time entries
 * @param paidBreak - Paid break duration in minutes
 * @returns Total hours as a number
 */
function calculateTotalHours(entries: TimeEntry[], paidBreak: number): number {
  // Implementation
}
```

### README Updates
- Keep README.md up to date
- Document new features
- Update setup instructions if needed

### API Documentation
- Add JSDoc comments to API endpoints
- Update OpenAPI/Swagger documentation
- Include example requests/responses

## Database Changes

### Migrations
```bash
# Create a new migration
# 1. Create file: migrations/XXX_description.sql
# 2. Add UP migration
# 3. Test migration locally
# 4. Document in migration file
```

### Schema Changes
- Always create migration scripts
- Never modify production database directly
- Test migrations on staging first
- Include rollback scripts

## Performance

### Frontend
- Lazy load routes and heavy components
- Use React.memo for expensive renders
- Optimize images (use WebP when possible)
- Minimize bundle size

### Backend
- Use database indexes appropriately
- Cache frequently accessed data
- Optimize N+1 queries
- Use connection pooling

## Accessibility

### WCAG 2.1 AA Compliance
- Use semantic HTML
- Provide alt text for images
- Ensure keyboard navigation
- Maintain color contrast ratio >4.5:1
- Add ARIA labels where needed

```tsx
// Good
<button aria-label="Delete item">
  <TrashIcon />
</button>

// Also good
<button>
  <TrashIcon aria-hidden="true" />
  <span>Delete</span>
</button>
```

## Security

### Security Best Practices
- Never commit secrets to Git
- Validate all user input
- Use parameterized queries
- Sanitize user-generated content
- Follow principle of least privilege

### Reporting Security Issues
See [SECURITY.md](./SECURITY.md) for details.

## Release Process

1. Version bump in package.json
2. Update CHANGELOG.md
3. Create release tag
4. Deploy to staging
5. QA testing
6. Deploy to production
7. Monitor for issues

## Getting Help

- **Documentation**: Check `/docs` folder
- **Discussions**: GitHub Discussions
- **Issues**: GitHub Issues
- **Email**: dev@tidsflyt.no

## Recognition

Contributors will be recognized in:
- GitHub contributors page
- CHANGELOG.md for significant contributions
- Credits in the application (coming soon)

Thank you for contributing to Tidsflyt! 🎉
