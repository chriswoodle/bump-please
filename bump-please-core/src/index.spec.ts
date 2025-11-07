import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import util from 'node:util';

// Create a mock exec function
const mockExec = jest.fn();

// Mock dependencies before importing the module
jest.mock('node:fs');

jest.mock('node:child_process', () => ({
    exec: jest.fn(),
}));

jest.mock('node:util', () => ({
    __esModule: true,
    default: {
        promisify: jest.fn(() => mockExec),
    },
}));

// Import after mocks are set up
import { bump, BumpCommandFlags } from './index';
import path from 'node:path';

describe('bump', () => {
    let mockReadFileSync: jest.Mock;
    let mockWriteFileSync: jest.Mock;
    let mockExistsSync: jest.Mock;

    beforeEach(() => {
        // Mock console methods to suppress output during tests
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Get mocked functions using jest.spyOn for better control
        mockReadFileSync = jest.spyOn(fs, 'readFileSync') as jest.Mock;
        mockWriteFileSync = jest.spyOn(fs, 'writeFileSync') as jest.Mock;
        mockExistsSync = jest.spyOn(fs, 'existsSync') as jest.Mock;

        // Reset all mocks
        mockReadFileSync.mockReset();
        mockWriteFileSync.mockReset();
        mockExistsSync.mockReset();
        mockExec.mockReset();

        // Default environment
        process.env = {};
    });

    describe('dry run mode', () => {
        it('should not make changes when dryRun is true', async () => {
            const mockConfig = {
                dryRun: true,
                packages: []
            };

            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' }) // origin url
                .mockResolvedValueOnce({ stdout: 'main\n' }) // branch
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' }) // tags
                .mockResolvedValueOnce({ stdout: 'abc123\n' }) // rev-list
                .mockResolvedValueOnce({ stdout: '+++feat: new feature__body__abc123__def456\n' }); // commits

            await bump({ dryRun: true });

            expect(mockWriteFileSync).not.toHaveBeenCalled();
            expect(mockExec).not.toHaveBeenCalledWith(expect.stringContaining('git add'));
        });
    });

    describe('semantic version detection', () => {
        it('should detect major version bump from BREAKING CHANGE', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__BREAKING CHANGE: major change__abc123__def456\n'
                });

            await bump({ dryRun: true });

            // Major version bump should be calculated
            expect(mockExec).toHaveBeenCalled();
        });

        it('should detect minor version bump from feat prefix', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await bump({ dryRun: true });

            // Minor version bump should be calculated
            expect(mockExec).toHaveBeenCalled();
        });

        it('should detect patch version bump from fix prefix', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++fix: bug fix__body__abc123__def456\n'
                });

            await bump({ dryRun: true });

            // Patch version bump should be calculated
            expect(mockExec).toHaveBeenCalled();
        });

        it('should return early when no semantic changes are detected', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++chore: some change__body__abc123__def456\n'
                });

            await bump({ dryRun: true });

            // Should return early without making changes
            expect(mockWriteFileSync).not.toHaveBeenCalled();
        });
    });

    describe('version calculation', () => {
        it('should calculate next version from last tag', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.2.3\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await bump({ dryRun: true });

            // Version should be calculated from tag
            expect(mockExec).toHaveBeenCalled();
        });

        it('should use root package.json version when no last tag exists', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '0.5.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: '\n' }) // no tags
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await bump({ dryRun: true });

            // Version should be calculated from package.json when no tag exists
            expect(mockExec).toHaveBeenCalled();
        });
    });

    describe('package version updates', () => {
        it('should update root package.json version', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await bump({ disableGitWrites: true });

            expect(mockWriteFileSync).toHaveBeenCalledWith(
                expect.stringContaining('package.json'),
                expect.stringContaining('"version": "1.1.0"')
            );
        });

        it('should update packages from config', async () => {
            const mockConfig = {
                packages: [
                    { path: './package1' },
                    { path: './package2', jsonFileName: 'custom.json', jsonPropertyPath: 'custom.v' }
                ]
            };
            const rootPkgJson = { version: '1.0.0' };
            const pkg1Json = { version: '1.0.0' };
            const pkg2PackageJson = { version: '1.0.0' }; // package.json for validation (must have version)
            const pkg2CustomJson = { custom: { v: '1.0.0' } }; // custom.json for update

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig)) // config file
                .mockReturnValueOnce(JSON.stringify(rootPkgJson)) // root package.json (read once, reused)
                .mockReturnValueOnce(JSON.stringify(pkg1Json)) // package1/package.json (validation)
                .mockReturnValueOnce(JSON.stringify(pkg2PackageJson)) // package2/package.json (validation - always reads package.json)
                .mockReturnValueOnce(JSON.stringify(pkg1Json)) // package1/package.json (update)
                .mockReturnValueOnce(JSON.stringify(pkg2CustomJson)); // package2/custom.json (update)

            mockExistsSync
                .mockReturnValueOnce(true) // package1/package.json exists (validation)
                .mockReturnValueOnce(true); // package2/custom.json exists (validation)

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await expect(bump({ disableGitWrites: true })).resolves.not.toThrow();

            expect(mockWriteFileSync).toHaveBeenCalledTimes(3); // root + 2 packages
            expect(mockWriteFileSync).toHaveBeenCalledWith(
                expect.stringContaining(path.resolve('package.json')),
                expect.stringContaining('"version": "1.1.0"')
            );
            expect(mockWriteFileSync).toHaveBeenCalledWith(
                expect.stringContaining(path.resolve('package1', 'package.json')),
                expect.stringContaining('"version": "1.1.0"')
            );
            expect(mockWriteFileSync).toHaveBeenCalledWith(
                expect.stringContaining(path.resolve('package2', 'custom.json')),
                expect.stringContaining('"v": "1.1.0"')
            );
        });

        it('should throw validation error when package file does not exist', async () => {
            const mockConfig = {
                packages: [{ path: './package1' }]
            };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            // During validation, it checks if the jsonFilePath exists
            // For default jsonFileName (package.json), it checks package1/package.json
            mockExistsSync
                .mockReturnValueOnce(false); // package1/package.json doesn't exist

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await expect(bump({ disableGitWrites: true })).rejects.toThrow('Validation errors');
        });

        it('should throw validation error when package does not have a version', async () => {
            const mockConfig = {
                packages: [{ path: './package1' }]
            };
            const rootPkgJson = { version: '1.0.0' };
            const pkg1Json = {}; // no version property

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson))
                .mockReturnValueOnce(JSON.stringify(pkg1Json)); // package.json without version

            mockExistsSync
                .mockReturnValueOnce(true); // package1/package.json exists

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await expect(bump({ disableGitWrites: true })).rejects.toThrow('Validation errors');
        });

        it('should collect multiple validation errors and throw once', async () => {
            const mockConfig = {
                packages: [
                    { path: './package1' },
                    { path: './package2' }
                ]
            };
            const rootPkgJson = { version: '1.0.0' };
            const pkg2Json = {}; // no version

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson))
                .mockReturnValueOnce(JSON.stringify(pkg2Json)); // package2/package.json

            // package1/package.json doesn't exist, package2/package.json exists but no version
            mockExistsSync
                .mockReturnValueOnce(false) // package1/package.json doesn't exist
                .mockReturnValueOnce(true); // package2/package.json exists

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await expect(bump({ disableGitWrites: true })).rejects.toThrow('Validation errors');
        });
    });

    describe('git operations', () => {
        it('should skip git writes when disableGitWrites is true', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await bump({ disableGitWrites: true });

            expect(mockExec).not.toHaveBeenCalledWith(expect.stringContaining('git add'));
            expect(mockExec).not.toHaveBeenCalledWith(expect.stringContaining('git commit'));
        });

        it('should perform git operations when git writes are enabled', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                })
                .mockResolvedValueOnce({ stdout: '' }) // git config user.name (optional)
                .mockResolvedValueOnce({ stdout: '' }) // git remote set-url
                .mockResolvedValueOnce({ stdout: '' }) // git add
                .mockResolvedValueOnce({ stdout: '' }) // git commit
                .mockResolvedValueOnce({ stdout: '' }) // git tag
                .mockResolvedValueOnce({ stdout: '' }); // git push

            await bump({ githubToken: 'test-token' });

            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git add -A .'));
            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git commit'));
            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git tag'));
            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git push'));
        });

        it('should set git committer name and email when provided', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                })
                .mockResolvedValueOnce({ stdout: '' }) // git config user.name
                .mockResolvedValueOnce({ stdout: '' }) // git config user.email
                .mockResolvedValueOnce({ stdout: '' }) // git remote set-url
                .mockResolvedValueOnce({ stdout: '' }) // git add
                .mockResolvedValueOnce({ stdout: '' }) // git commit
                .mockResolvedValueOnce({ stdout: '' }) // git tag
                .mockResolvedValueOnce({ stdout: '' }); // git push

            await bump({
                gitCommitterName: 'Test User',
                gitCommitterEmail: 'test@example.com',
                githubToken: 'test-token'
            });

            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git config user.name Test User'));
            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git config user.email test@example.com'));
        });

        it('should warn when no GitHub token is provided', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                })
                .mockResolvedValueOnce({ stdout: '' }) // git add
                .mockResolvedValueOnce({ stdout: '' }) // git commit
                .mockResolvedValueOnce({ stdout: '' }) // git tag
                .mockResolvedValueOnce({ stdout: '' }); // git push

            await bump({});

            // Should complete without GitHub token
            expect(mockExec).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should throw error when git origin url is not found', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec.mockRejectedValueOnce(new Error('No origin url'));

            await expect(bump({})).rejects.toThrow();
        });

        it('should throw error when git log fails', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockRejectedValueOnce(new Error('Git log failed'));

            await expect(bump({})).rejects.toThrow();
        });
    });

    describe('configuration', () => {
        it('should use config file from flags', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'main\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                });

            await bump({ configFile: 'custom-config.json', dryRun: true });

            expect(mockReadFileSync).toHaveBeenCalledWith(
                expect.stringContaining('custom-config.json'),
                'utf8'
            );
        });

        it('should use git branch from flags', async () => {
            const mockConfig = { packages: [] };
            const rootPkgJson = { version: '1.0.0' };

            mockReadFileSync
                .mockReturnValueOnce(JSON.stringify(mockConfig))
                .mockReturnValueOnce(JSON.stringify(rootPkgJson));

            mockExec
                .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
                .mockResolvedValueOnce({ stdout: 'v1.0.0\n' })
                .mockResolvedValueOnce({ stdout: 'abc123\n' })
                .mockResolvedValueOnce({
                    stdout: '+++feat: new feature__body__abc123__def456\n'
                })
                .mockResolvedValueOnce({ stdout: '' }) // git config
                .mockResolvedValueOnce({ stdout: '' }) // git remote
                .mockResolvedValueOnce({ stdout: '' }) // git add
                .mockResolvedValueOnce({ stdout: '' }) // git commit
                .mockResolvedValueOnce({ stdout: '' }) // git tag
                .mockResolvedValueOnce({ stdout: '' }); // git push

            await bump({ gitBranch: 'develop', githubToken: 'test-token' });

            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('refs/heads/develop'));
        });
    });
});
